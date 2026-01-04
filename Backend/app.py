from flask import Flask, jsonify, request, Response
from flask import url_for, redirect, has_request_context
from flask_cors import CORS
import os
import json
from types import SimpleNamespace
import threading
import time
import openai
from openai import OpenAI
import chatomatic
from retry import retry
import backoff
import random
import uuid
import requests
from dotenv import load_dotenv
from reflection_system_prompt import PHASE_DEFINITIONS

load_dotenv()

api_key = os.environ.get("OPENAI_API_KEY", "").strip()
if api_key == "":
    raise RuntimeError("OPENAI_API_KEY environment variable is not set.")

openai.api_key = api_key
openai_client = OpenAI(api_key=api_key)

chatomatic_engine = chatomatic.Chatomatic(openai_client)

lock = threading.Lock()
tts_audio_lock = threading.Lock()
voice_job_lock = threading.Lock()
DEFAULT_TTS_STYLE_PRESET = "professional"
VOICE_JOB_TTL_SECONDS = int(os.environ.get("VOXAREFLECT_VOICE_JOB_TTL", "900"))

import os

# Determine if running on PythonAnywhere or locally
if os.path.exists('/home/bichp1'):  # PythonAnywhere
    FRONTEND_BUILD_PATH = '/home/bichp1/VoxaReflect/Frontend/build'
else:  # Local development
    FRONTEND_BUILD_PATH = os.path.join(os.path.dirname(__file__), '..', 'Frontend', 'build')

app = Flask(__name__, 
            static_folder=FRONTEND_BUILD_PATH,
            static_url_path='')

CORS(app)

def load_tts_config():
    mode = os.environ.get("VOXAREFLECT_TTS_MODE", "none").strip().lower()
    endpoint = os.environ.get("VOXAREFLECT_TTS_ENDPOINT", "").strip()
    legacy_voice = os.environ.get("VOXAREFLECT_TTS_VOICE", "").strip()
    audio_format = os.environ.get("VOXAREFLECT_TTS_FORMAT", "audio/mpeg").strip()
    timeout = float(os.environ.get("VOXAREFLECT_TTS_TIMEOUT", "15"))
    headers_env = os.environ.get("VOXAREFLECT_TTS_HEADERS", "")
    headers = {}
    if headers_env:
        try:
            headers = json.loads(headers_env)
        except json.JSONDecodeError as decode_error:
            print("Failed to parse VOXAREFLECT_TTS_HEADERS JSON ==>", decode_error)
            headers = {}
    token_value = os.environ.get("VOXAREFLECT_TTS_AUTH_TOKEN", "").strip()
    if token_value != "" and "Authorization" not in headers:
        headers["Authorization"] = token_value
    openai_model = os.environ.get("OPENAI_TTS_MODEL", "gpt-4o-mini-tts").strip()
    default_voice = os.environ.get("OPENAI_TTS_DEFAULT_VOICE", "").strip()
    if default_voice == "":
        default_voice = legacy_voice
    if default_voice == "":
        default_voice = "alloy"
    warm_instruction = os.environ.get(
        "OPENAI_TTS_INSTRUCTION_WARM",
        "Use a warm, encouraging tutoring style."
    ).strip()
    professional_instruction = os.environ.get(
        "OPENAI_TTS_INSTRUCTION_PROFESSIONAL",
        "Speak in a calm, professional voice suited for academic coaching."
    ).strip()
    allowed_voices_env = os.environ.get("OPENAI_TTS_ALLOWED_VOICES", "").strip()
    if allowed_voices_env != "":
        deduped = []
        seen = set()
        for raw_voice in allowed_voices_env.split(","):
            voice = raw_voice.strip()
            if voice == "" or voice in seen:
                continue
            deduped.append(voice)
            seen.add(voice)
        allowed_voices = deduped
    else:
        # Keep to a curated set of calm voices to avoid overly emotional rendering.
        allowed_voices = ["alloy", "verse", "lumen"]
    if default_voice != "":
        prioritized = [default_voice]
        prioritized.extend([voice for voice in allowed_voices if voice != default_voice])
        allowed_voices = prioritized
    return {
        "mode": mode,
        "endpoint": endpoint,
        "voice": default_voice,
        "headers": headers,
        "format": audio_format,
        "timeout": timeout,
        "openai_model": openai_model,
        "default_voice": default_voice,
        "style_instructions": {
            "warm": warm_instruction,
            "professional": professional_instruction
        },
        "preset_default_voices": {
            "warm": default_voice,
            "professional": default_voice
        },
        "allowed_voices": allowed_voices
    }

tts_config = load_tts_config()
tts_audio_cache = {}
voice_jobs = {}

def cleanup_voice_jobs_locked():
    now = time.time()
    expired = []
    for job_id, job_data in voice_jobs.items():
        created_at = job_data.get("created_at", now)
        if now - created_at > VOICE_JOB_TTL_SECONDS:
            expired.append(job_id)
    for job_id in expired:
        voice_jobs.pop(job_id, None)

def create_voice_job():
    job_id = str(uuid.uuid4())
    with voice_job_lock:
        cleanup_voice_jobs_locked()
        voice_jobs[job_id] = {
            "status": "pending",
            "result": None,
            "error": None,
            "created_at": time.time()
        }
    return job_id

def update_voice_job(job_id, **updates):
    with voice_job_lock:
        job_entry = voice_jobs.get(job_id, {"created_at": time.time()})
        for key, value in updates.items():
            job_entry[key] = value
        voice_jobs[job_id] = job_entry

def get_voice_job(job_id):
    with voice_job_lock:
        cleanup_voice_jobs_locked()
        job_entry = voice_jobs.get(job_id)
        if job_entry is None:
            return None
        return dict(job_entry)
TTS_CACHE_TTL_SECONDS = int(os.environ.get("VOXAREFLECT_TTS_CACHE_TTL", "300"))

def get_tts_style_config(style_preset, requested_voice):
    """
    Map `warm` and `professional` presets to short OpenAI TTS instructions.
    Voices are restricted to a vetted list so the assistant never becomes overly
    theatrical or personalized.
    """
    preset_key = (style_preset or "").strip().lower()
    if preset_key not in tts_config["style_instructions"]:
        preset_key = DEFAULT_TTS_STYLE_PRESET
    instruction = tts_config["style_instructions"].get(preset_key, "")
    preset_voice = tts_config["preset_default_voices"].get(preset_key, "")
    allowed_voices = tts_config.get("allowed_voices", [])
    if isinstance(requested_voice, str):
        requested_voice_value = requested_voice.strip()
    else:
        requested_voice_value = ""
    if requested_voice_value != "" and (len(allowed_voices) == 0 or requested_voice_value in allowed_voices):
        voice_to_use = requested_voice_value
    else:
        voice_to_use = preset_voice if preset_voice != "" else tts_config.get("default_voice", "")
    if voice_to_use == "":
        voice_to_use = tts_config.get("voice", "alloy")
    return {
        "style_preset": preset_key,
        "instruction": instruction,
        "voice": voice_to_use
    }

def cleanup_tts_audio_cache():
    now = time.time()
    expired_keys = []
    for audio_id, audio_data in tts_audio_cache.items():
        if now - audio_data["timestamp"] > TTS_CACHE_TTL_SECONDS:
            expired_keys.append(audio_id)
    for audio_id in expired_keys:
        tts_audio_cache.pop(audio_id, None)

def store_tts_audio(audio_bytes, content_type):
    with tts_audio_lock:
        cleanup_tts_audio_cache()
        audio_id = str(uuid.uuid4())
        tts_audio_cache[audio_id] = {
            "bytes": audio_bytes,
            "content_type": content_type,
            "timestamp": time.time()
        }
    return audio_id

def synthesize_speech(text, tts_eligible, style_preset, requested_voice):
    style_config = get_tts_style_config(style_preset, requested_voice)
    if not tts_eligible:
        return None, style_config
    if text is None or str(text).strip() == "":
        return None, style_config
    config = tts_config
    if config["mode"] == "none" or config["endpoint"] == "":
        return None, style_config
    payload = {
        "model": config.get("openai_model", ""),
        "voice": style_config.get("voice", config.get("voice", "")),
        "input": text,
        "format": config.get("format", "")
    }
    instruction_text = style_config.get("instruction", "")
    if instruction_text != "":
        # OpenAI's TTS endpoint supports a brief `style` hint so we can gently bias delivery.
        payload["style"] = instruction_text
    # remove empty fields
    payload = {key: value for key, value in payload.items() if value}
    try:
        # Use OpenAI's HTTP Text-to-Speech endpoint so API keys remain server-side.
        response = requests.post(
            config["endpoint"],
            json=payload,
            headers=config.get("headers", {}),
            timeout=config.get("timeout", 15)
        )
        response.raise_for_status()
    except Exception as error:
        print("TTS synthesis failed ==>", error)
        return None, style_config
    audio_bytes = response.content
    if not audio_bytes:
        return None, style_config
    content_type = response.headers.get("Content-Type", config.get("format", "audio/mpeg"))
    audio_id = store_tts_audio(audio_bytes, content_type)
    return {
        "audio_id": audio_id,
        "mode": config.get("mode", "none"),
        "style_preset": style_config["style_preset"],
        "voice": style_config["voice"]
    }, style_config

def save(name, data):
    with open(name + ".json", "w") as file:
        json_dumps = json.dumps(data, default = lambda o: o.__dict__, indent = 2)
        file.write(json_dumps)

def load(name):
    with open(name + ".json", "r") as file:
        file_read = file.read()
        json_loads = json.loads(file_read)
        return json_loads


def askModel(newMessage, language_for_app, currentText = "", reflection_context = None, conversation_history=None): # returns answer, most_similar_question
    return chatomatic_engine.answer(newMessage, language_for_app, currentText, reflection_context=reflection_context, conversation_history=conversation_history)

def conversation_with_id(all_conversations, id):
    for conversation in all_conversations:
        if conversation["id"] == id:
            return conversation
    return None

@app.route('/')
def home():
    return app.send_static_file('index.html')

def return_message_from_openai(messages):
    global openai_client
    # Convert "system" to "developer" role for GPT-5.1 best practices
    messages_updated = []
    for msg in messages:
        if msg["role"] == "system":
            messages_updated.append({"role": "developer", "content": msg["content"]})
        else:
            messages_updated.append(msg)
    
    response = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=messages_updated,
        temperature=1.0  # GPT-5.1 requires temperature=1.0 exactly
    )
    return response

def askFromGPT(prompt):
    message = return_message_from_openai([{"role": "user", "content": prompt}])
    return message.choices[0].message.content

@app.route('/getConversations', methods=['POST'])
def get_conversations():
    username = str(request.json['username'])
    lock.acquire()
    try:
        conversations = load("conversations")
        lock.release()
        if not (username in conversations):
            return jsonify({"success": True, "result": []})
        else:
            user_conversations = []
            for conversation in conversations[username]:
                new_conversation = dict(conversation)
                if "turnPreset" not in new_conversation or not new_conversation["turnPreset"]:
                    new_conversation["turnPreset"] = TURN_PRESET_DEFAULT
                new_conversation["phase"] = build_phase_metadata(new_conversation.get("stage", ""))
                user_conversations.append(new_conversation)
            return jsonify({"success": True, "result": user_conversations})
    except Exception as exception:
        lock.release()
        print("Error in 'get_conversations' ==>", exception)
        return jsonify({"success": False, "result": []})

@app.route('/addChatToConversation', methods=['POST'])
def add_chat_to_conversation():
    current_time = time.time()
    username = str(request.json['username'])
    conversationID = int(request.json['conversationID']) # default: -1
    newMessageUser = str(request.json['newMessageUser'])
    newMessageSystem = str(request.json['newMessageSystem'])
    buttons = request.json['buttons']
    try:
        lock.acquire()
        conversations = load("conversations")
        lock.release()
        conversation = conversation_with_id(conversations[username], conversationID)
        conversation["messages"].append(
            {
                "sender": "user",
                "content": newMessageUser,
                "buttons": [],
                "video": "",
                "time": current_time
            }
        )
        conversation["messages"].append(
            {
                "sender": "system",
                "content": newMessageSystem,
                "buttons": buttons,
                "video": "",
                "time": current_time
            }
        )
        lock.acquire()
        save("conversations", conversations)
        lock.release()
        return jsonify({
            "success": True,
            "result": newMessageSystem,
            "buttons": buttons,
            "video": "",
            "time": current_time,
            "title": conversation['title'],
            "text": conversation['text'],
            "stage": conversation['stage'],
            "id": conversation['id'],
            "turnPreset": conversation.get('turnPreset', TURN_PRESET_DEFAULT),
            "phase": build_phase_metadata(conversation.get("stage", ""))
        })
    except Exception as error:
        print("Error in 'add_chat_to_conversation' ==>", error)
        if lock.locked():
            lock.release()
        return jsonify({"success": False, "result": "", "buttons": [], "video": "", "time": current_time, "title": "", "text": "", "stage": "", "id": conversationID})


@app.route('/updateTurnPreset', methods=['POST'])
def update_turn_preset():
    username = str(request.json['username'])
    conversation_id = int(request.json['conversationID'])
    raw_preset = request.json.get('turnPreset', TURN_PRESET_DEFAULT)
    normalized_preset = normalize_turn_preset(raw_preset)
    try:
        lock.acquire()
        conversations = load("conversations")
        if username not in conversations:
            lock.release()
            return jsonify({"success": False, "turnPreset": normalized_preset})
        conversation = conversation_with_id(conversations[username], conversation_id)
        if conversation is None:
            lock.release()
            return jsonify({"success": False, "turnPreset": normalized_preset})
        conversation["turnPreset"] = normalized_preset
        save("conversations", conversations)
        lock.release()
        return jsonify({"success": True, "turnPreset": normalized_preset})
    except Exception as error:
        print("Error in 'update_turn_preset' ==>", error)
        if lock.locked():
            lock.release()
        return jsonify({"success": False, "turnPreset": normalized_preset})


setOfStages = ['Description', 'Feelings', 'Evaluation', 'Analysis', 'Conclusion', 'Action Plan', 'done']

# Keep the enforced cap aligned with the guidance surfaced to the assistant.
DEFAULT_TURN_CAP = 4
PHASE_TURN_CAPS = {
    phase_name: definition.get("turn_target", DEFAULT_TURN_CAP)
    for phase_name, definition in PHASE_DEFINITIONS.items()
}

TURN_PRESET_DEFAULT = "standard"
TURN_PRESET_OPTIONS = ["short", "standard", "long"]


def _build_phase_turn_rules():
    def compute_rules(base_target):
        short_max = max(1, base_target - 1)
        long_min = max(1, base_target)
        return {
            "short": {
                "min": 0,
                "max": short_max
            },
            "standard": {
                "min": 1 if base_target >= 3 else 0,
                "max": base_target
            },
            "long": {
                "min": long_min,
                "max": base_target + 2
            }
        }

    rules = {}
    for stage_name in setOfStages:
        phase_definition = PHASE_DEFINITIONS.get(stage_name, {})
        preset_overrides = phase_definition.get("turn_presets")
        if isinstance(preset_overrides, dict) and len(preset_overrides) > 0:
            normalized = {}
            for preset_name, preset_rule in preset_overrides.items():
                if not isinstance(preset_rule, dict):
                    continue
                normalized[preset_name] = {
                    "min": max(0, int(preset_rule.get("min", 0))),
                    "max": max(1, int(preset_rule.get("max", DEFAULT_TURN_CAP)))
                }
            if normalized:
                rules[stage_name] = normalized
                continue
        base_target = phase_definition.get("turn_target", DEFAULT_TURN_CAP)
        rules[stage_name] = compute_rules(base_target)
    return rules


PHASE_TURN_RULES = _build_phase_turn_rules()


def normalize_turn_preset(preset_value):
    if not isinstance(preset_value, str):
        return TURN_PRESET_DEFAULT
    candidate = preset_value.strip().lower()
    if candidate in TURN_PRESET_OPTIONS:
        return candidate
    return TURN_PRESET_DEFAULT


def get_phase_turn_rule(phase_name, preset_name):
    preset_key = normalize_turn_preset(preset_name)
    phase_rules = PHASE_TURN_RULES.get(phase_name, {})
    rule = phase_rules.get(preset_key)
    if not rule:
        return {"min": 0, "max": DEFAULT_TURN_CAP}
    return {
        "min": max(0, int(rule.get("min", 0))),
        "max": max(1, int(rule.get("max", DEFAULT_TURN_CAP)))
    }

guidingQuestionsForEachStage_de = {
    'Description': 'Eigentlich kann ich im Text keine detaillierte Beschreibung des Ereignisses finden. Kannst du das Ereignis, über das du nachdenkst, genauer beschreiben?\nWenn du denkst, dass du den Klasse „Beschreibung" in deinem Text geschrieben hast, klicke einfach erneut auf die Schaltfläche „Feedback".',
    'Feelings': 'Die Beschreibungsklasse des Gibbs-Zyklus kann ich bereits im Text finden. Kannst du auch deine Gedanken und Gefühle beschreiben, als du in der Situation warst?\nWenn du denkst, dass du den Klasse „Gefühle" in deinem Text geschrieben hast, klicke einfach erneut auf die Schaltfläche „Feedback".',
    'Evaluation': 'Die Beschreibung und Gefühlsklassen des Gibbs-Zyklus kann ich bereits im Text finden. Kannst du auch deine Meinung zu den positiven oder negativen Punkten deiner Reaktion zum Zeitpunkt der Veranstaltung schildern?\nWenn du denkst, dass du den Klasse „Bewertung" in deinem Text geschrieben hast, klicke einfach erneut auf die Schaltfläche „Feedback".',
    'Analysis': 'Die Beschreibung, Gefühle und Bewertungsklassen des Gibbs-Zyklus kann ich bereits im Text finden. Kannst du auch die Gründe für deine Meinung zum Vorfall beschreiben? Du kannst dich auch auf Referenzen beziehen, die deine Anliegen unterstützen!\nWenn du denkst, dass du den Klasse „Analyze" in deinem Text geschrieben hast, klicke einfach erneut auf die Schaltfläche „Feedback".',
    'Conclusion': 'Die Beschreibungs-, Gefühls-, Bewertungs- und Analyseklassen des Gibbs-Zyklus kann ich bereits im Text finden. Kannst du nun zusammenfassen, was passiert ist und was du aus der Veranstaltung gewonnen hast?\nWenn du denkst, dass du den Klasse „Schlussfolgerung" in deinem Text geschrieben hast, klicke einfach erneut auf die Schaltfläche „Feedback".',
    'Action Plan': 'Ich kann fast alle Komponenten des Gibbs-Reflexionszyklus in Ihrem Schreiben wiederfinden :) Für die letzte Komponente: du uns nun deine Meinung dazu mitteilen, was du anders machen würdest, wenn du das nächste Mal mit einer ähnlichen Situation konfrontiert würdest?\nWenn du denkst, dass du den Klasse „Aktionsplan" in deinem Text geschrieben hast, klicke einfach erneut auf die Schaltfläche „Feedback".'
}

guidingQuestionsForEachStage_en = {
    'Description': 'Actually, I cannot find a detailed description of the event in the text. Can you describe the event you are reflecting on in more detail?\nIf you think you have written the "Description" class in your text, just click on the "Feedback" button again.',
    'Feelings': 'I can already find the description class of the Gibbs cycle in the text. Can you also describe your thoughts and feelings when you were in the situation?\nIf you think you have written the "Feelings" class in your text, just click on the "Feedback" button again.',
    'Evaluation': 'I can already find the description and feelings classes of the Gibbs cycle in the text. Can you also describe your opinion on the positive or negative points of your response at the time of the event?\nIf you think you have written the "Evaluation" class in your text, just click on the "Feedback" button again.',
    'Analysis': 'I can already find the description, feelings, and evaluation classes of the Gibbs cycle in the text. Can you also describe the reasons for your opinion on the incident? You can also refer to references that support your concerns!\nIf you think you have written the "Analysis" class in your text, just click on the "Feedback" button again.',
    'Conclusion': 'I can already find the description, feelings, evaluation, and analysis classes of the Gibbs cycle in the text. Can you now summarize what happened and what you gained from the event?\nIf you think you have written the "Conclusion" class in your text, just click on the "Feedback" button again.',
    'Action Plan': 'I can find almost all components of the Gibbs reflective cycle in your writing :) For the last component: can you now tell us your opinion on what you would do differently if you were faced with a similar situation next time?\nIf you think you have written the "Action Plan" class in your text, just click on the "Feedback" button again.'
}

buttonsForEachStage_de = {
    'Description': ['Gib mir mehr Details über die Beschreibungsklasse des Gibbs-Reflexionszyklus.'],
    'Feelings': ['Gib mir mehr Details über die Gefühlsklasse des Gibbs-Reflexionszyklus.'],
    'Evaluation': ['Gib mir mehr Details über die Bewertungsklasse des Gibbs-Reflexionszyklus.'],
    'Analysis': ['Gib mir mehr Details über die Analyze-Klasse des Gibbs-Reflexionszyklus.'],
    'Conclusion': ['Gib mir mehr Details über die Schlussfolgerungsklasse des Gibbs-Reflexionszyklus.'],
    'Action Plan': ['Gib mir mehr Details über die Aktionsplan-Klasse des Gibbs-Reflexionszyklus.']
}

buttonsForEachStage_en = {
    'Description': ['Give me more details about the Description class of the Gibbs reflective cycle.'],
    'Feelings': ['Give me more details about the Feelings class of the Gibbs reflective cycle.'],
    'Evaluation': ['Give me more details about the Evaluation class of the Gibbs reflective cycle.'],
    'Analysis': ['Give me more details about the Analysis class of the Gibbs reflective cycle.'],
    'Conclusion': ['Give me more details about the Conclusion class of the Gibbs reflective cycle.'],
    'Action Plan': ['Give me more details about the Action Plan class of the Gibbs reflective cycle.']
}


def build_phase_metadata(stage_value):
    total_main_stages = max(len(setOfStages) - 1, 1)
    phase = {
        "currentStage": "",
        "currentIndex": 1,
        "totalStages": total_main_stages,
        "isFinished": False
    }
    if len(setOfStages) == 0:
        return phase
    current_stage = stage_value if isinstance(stage_value, str) else ""
    if current_stage == "":
        phase["currentStage"] = setOfStages[0]
    elif current_stage == "done":
        phase["currentStage"] = "done"
        phase["currentIndex"] = total_main_stages
        phase["isFinished"] = True
    elif current_stage in setOfStages:
        phase["currentStage"] = current_stage
        phase["currentIndex"] = min(setOfStages.index(current_stage) + 1, total_main_stages)
    else:
        phase["currentStage"] = current_stage
    return phase


def advance_stage_if_needed(current_stage, phase_suggestion, calculated_next_phase=None, turns_elapsed=0, turn_rule=None):
    """
    Move to the next stage if the model suggests advancing.
    
    If calculated_next_phase is provided (from chatomatic.py's two-step architecture),
    use that directly. Otherwise fall back to the old logic.
    `turns_elapsed` counts how many turns have already happened for the current
    phase (including the newest one). If it reaches the cap defined for that
    phase, the stage will be advanced automatically.
    """
    stages = setOfStages
    if len(stages) == 0:
        return current_stage
    suggestion = (phase_suggestion or "").strip().lower()

    def move_to_next_stage(stage_value):
        if stage_value is None or stage_value == "":
            return stages[0]
        if stage_value not in stages:
            return stage_value
        index = stages.index(stage_value)
        if index >= len(stages) - 1:
            return stages[-1]
        return stages[index + 1]

    phase_cap = PHASE_TURN_CAPS.get(current_stage, DEFAULT_TURN_CAP)
    phase_min = 0
    if isinstance(turn_rule, dict):
        phase_min = max(0, int(turn_rule.get("min", 0)))
        phase_cap = max(1, int(turn_rule.get("max", phase_cap)))
    if isinstance(turns_elapsed, int) and turns_elapsed < phase_min:
        print(f"DEBUG advance_stage_if_needed: Staying in {current_stage} because turns_elapsed {turns_elapsed} < min {phase_min}")
        return current_stage
    if isinstance(turns_elapsed, int) and turns_elapsed >= phase_cap:
        print(f"DEBUG advance_stage_if_needed: Forced advance after {turns_elapsed} turns (cap {phase_cap})")
        return move_to_next_stage(current_stage)
    
    # NEW: If chatomatic.py already calculated the next phase, use it directly
    if suggestion == "advance" and calculated_next_phase:
        print(f"DEBUG advance_stage_if_needed: Using calculated_next_phase: {calculated_next_phase}")
        return calculated_next_phase
    
    # OLD: Fallback logic if no calculated phase provided
    if suggestion != "advance":
        return current_stage
    return move_to_next_stage(current_stage)


def determine_current_stage_and_if_returned_no(text, old_current_stage):
    old_current_stage_index = 0
    if old_current_stage in setOfStages:
        old_current_stage_index = setOfStages.index(old_current_stage)
    if old_current_stage_index >= len(setOfStages) - 1:
        return "done", False
    for i in range(old_current_stage_index, len(setOfStages) - 1):
        stage = setOfStages[i]
        prompt = "Imagine you are a university teacher. Your student has written the following reflective text:\n\n" + text + "\n\nDo you find any sentence in their text from the '" + stage + "' class of the Gibbs reflective cycle? (This class "
        if stage == "Description":
            prompt += "describes the event the student is reflecting on."
        elif stage == "Feelings":
            prompt += "describes the thoughts and feelings of the student when they were in the situation."
        elif stage == 'Evaluation':
            prompt += "describes the opinion of the student on the positive or negative points of their response at the time of the event."
        elif stage == "Analysis":
            prompt += "describes the reasons for the opinion of the student on the incident. It may also refer to references that support the concerns."
        elif stage == "Conclusion":
            prompt += "summarizes what happened and what the student gained from the event."
        elif stage == "Action Plan":
            prompt += "describes the opinion of the student on what they would do differently if they were faced with a similar situation next time."
        prompt += ") You should start answering with a clear yes or no. Then, you can explain your answer in 1-2 sentences."
        response = askFromGPT(prompt)
        if response.lower().startswith("yes"):
            continue
        else:
            return stage, True
    return "done", False

@app.route('/determineFeedbackAndTitle', methods=['POST'])
def determine_feedback_and_title():
    text = str(request.json['text'])
    language = str(request.json['language'])
    currentStage = str(request.json['currentStage'])
    try:
        lock.acquire()
        conversations = load("conversations")
        lock.release()
        oldStage = currentStage
        newStage, didReturn = determine_current_stage_and_if_returned_no(text, oldStage)
        if not didReturn:
            if language == "de":
                feedback = askFromGPT("Stell dir vor, du bist ein Universitätslehrer eines Bachelor-Kurses für Wirtschaftsstudenten. Der Kurs behandelt 'Business Process Management' und lehrt die Grundlagen des Prozessmanagements, die Notation von Geschäftsprozessen, Prozessdesign, Prozessneuentwurf und Prozess-Mining. Neben den Vorlesungen möchtest du nun auch die Studenten mit reflektierenden Schreibübungen zur Reflexion über die gelernten Inhalte und die praktischen Übungen und Fallstudien zum Prozessmanagement engagieren. Dein Student hat folgenden reflektierenden Text geschrieben:\n\n" + str(text).strip() + "\n\nDer Text ist bereits in einem sehr guten Zustand und scheint alle Komponenten aus dem Gibbs-Reflexionszyklus zu enthalten. Du kannst dem Studenten jedoch noch einige Rückmeldungen geben, um sein reflektierendes Schreiben zu verbessern (einschließlich, aber nicht beschränkt auf Rückmeldungen zur Klarheit und Schreibqualität). Bitte gib dem Studenten einige Rückmeldungen. Beginne mit etwas wie 'Fantastisch gemacht mit deinem reflektierenden Text! Es sieht so aus, als ob du fast alle notwendigen Komponenten aus dem Gibbs-Reflexionszyklus einbezogen hast.' und gib dann deine Rückmeldung. Am Ende füge 'Wenn du Fragen hast, lass es mich bitte wissen!' hinzu. Alle deine Rückmeldungen sollten nur auf Deutsch sein. Bitte sprich den Studenten mit 'Du' und nicht mit 'Sie' an, da du als persönlicher Tutor auftreten sollst. Richte das Feedback an den Studenten, nicht an seinen Lehrer.")
            else:
                feedback = askFromGPT("Imagine you are a university teacher of a bachelor course for business students. The course is on 'business process management' and you teach them about the foundations of process management, business process management notation, process design, process redesign and process mining. However, now, besides the lecture, you aim to engage the students in reflective writing exercises to reflect on the learned content and on the practical exercises and case studies they are doing on process management. Your student has written the following reflective text:\n\n" + str(text).strip() + "\n\nThe text is already in a very good condition and seems to include all the components from the Gibbs reflective cycle. However, you can still provide some feedback to the student to help them improve their reflective writing (including but not limited to feedback on clarity and writing quality). Please provide some feedback to the student. Start with something like 'Fantastisch gemacht mit deinem reflektierenden Text! Es sieht so aus, als ob du fast alle notwendigen Komponenten aus dem Gibbs-Reflexionszyklus einbezogen hast.' and then provide your feedback. In the end, add 'Wenn du Fragen hast, lass es mich bitte wissen!'. All your feedback should only be in German. Please address the student as 'Du' not 'Sie' as you should act as a personal tutor. Target the feedback to the student, not to their teacher.")
        else:
            if language == "de":
                feedback = guidingQuestionsForEachStage_de[newStage]
            else:
                feedback = guidingQuestionsForEachStage_en[newStage]
        return jsonify({"success": True, "result": feedback, "new_stage": newStage})
    except Exception as error:
        print("Error in 'determine_feedback_and_title' ==>", error)
        if lock.locked():
            lock.release()
        return jsonify({"success": False, "result": "", "new_stage": currentStage})

@app.route('/createNewTitle', methods=['POST'])
def create_new_title():
    text = str(request.json['text'])
    language = str(request.json['language'])
    username = str(request.json['username'])
    conversationID = int(request.json['conversationID'])
    try:
        lock.acquire()
        conversations = load("conversations")
        lock.release()
        if not (username in conversations):
            lock.acquire()
            lock.release()
            return jsonify({"success": False, "result": "", "buttons": [], "new_title": ""})
        else:
            conversation = conversation_with_id(conversations[username], conversationID)
            if conversation is not None:
                if language == "de":
                    conversation["title"] = askFromGPT("Suggest a very short (2-3 words) title for this German reflective text:\n\n" + text + "\n\nThe title should be appropriate for a reflective text. Only give the title (without any quotes or other symbols) and no other text. Your output should be in German language.")
                else:
                    conversation["title"] = askFromGPT("Suggest a very short (2-3 words) title for this reflective text:\n\n" + text + "\n\nThe title should be appropriate for a reflective text. Only give the title (without any quotes or other symbols) and no other text.")
                lock.acquire()
                save("conversations", conversations)
                lock.release()
                return jsonify({"success": True, "result": conversation["title"], "buttons": [], "new_title": conversation["title"]})
            else:
                lock.acquire()
                lock.release()
                return jsonify({"success": False, "result": "", "buttons": [], "new_title": ""})
    except Exception as error:
        print("Error in 'create_new_title' ==>", error)
        if lock.locked():
            lock.release()
        return jsonify({"success": False, "result": "", "buttons": [], "new_title": ""})


@app.route("/uploadAudio", methods=['POST'])
def uploadAudio():
    files = request.files
    file = files.get('file')
    if file is None:
        return jsonify({"success": False, "result": "", "error": "Missing audio file"}), 400
    metadata_raw = request.form.get('metadata', '').strip()
    language_hint = str(request.form.get('language', '') or '').strip()
    temp_filename = f'audio-{uuid.uuid4()}.mp4'
    try:
        file.save(temp_filename)
    except Exception as error:
        print("Error saving uploaded audio ==>", error)
        return jsonify({"success": False, "result": "", "error": "Failed to save audio"}), 500
    if metadata_raw == "":
        try:
            with open(temp_filename, "rb") as audio_file:
                transcription_kwargs = {
                    "model": "whisper-1",
                    "file": audio_file
                }
                if language_hint != "":
                    transcription_kwargs["language"] = language_hint
                transcription = openai_client.audio.transcriptions.create(**transcription_kwargs)
            os.remove(temp_filename)
            return jsonify({"success": True, "result": transcription.text})
        except Exception as error:
            print("Error in 'uploadAudio' transcription ==>", error)
            try:
                os.remove(temp_filename)
            except Exception:
                pass
            return jsonify({"success": False, "result": ""})
    try:
        metadata = json.loads(metadata_raw)
        if isinstance(metadata, dict) and language_hint != "":
            metadata.setdefault("language", language_hint)
    except json.JSONDecodeError:
        try:
            os.remove(temp_filename)
        except Exception:
            pass
        return jsonify({"success": False, "result": "", "error": "Invalid metadata"}), 400
    job_id = create_voice_job()
    update_voice_job(job_id, status="queued", result=None, error=None)
    worker = threading.Thread(target=process_voice_job_async, args=(job_id, temp_filename, metadata), daemon=True)
    worker.start()
    return jsonify({"success": True, "jobId": job_id})

@app.route('/tts/audio/<audio_id>', methods=['GET'])
def serve_tts_audio(audio_id):
    with tts_audio_lock:
        cleanup_tts_audio_cache()
        audio_entry = tts_audio_cache.get(audio_id)
    if audio_entry is None:
        return jsonify({"success": False, "result": "", "error": "Audio not found"}), 404
    response = Response(audio_entry["bytes"], mimetype=audio_entry["content_type"])
    response.headers["Cache-Control"] = "no-store"
    return response

@app.route('/tts/config', methods=['GET'])
def get_tts_config():
    return jsonify({
        "allowedVoices": tts_config.get("allowed_voices", []),
        "defaultVoice": tts_config.get("default_voice", ""),
        "mode": tts_config.get("mode", "none")
    })

def process_chat_turn(payload):
    if payload is None:
        payload = {}
    timing_info = {}
    def merge_timing_data(meta):
        if not isinstance(meta, dict):
            return
        for key, value in meta.items():
            if isinstance(value, (int, float)):
                try:
                    timing_info[key] = float(value)
                except (TypeError, ValueError):
                    continue
    incoming_timing = payload.get("timingMetadata")
    if isinstance(incoming_timing, dict):
        merge_timing_data(incoming_timing)
    current_time = time.time()
    username = str(payload.get('username', ''))
    newMessage = str(payload.get('newMessage', '') or '')
    currentText = str(payload.get('currentText', '') or '')
    try:
        conversationID = int(payload.get('conversationID', -1))
    except (TypeError, ValueError):
        conversationID = -1
    language = str(payload.get('language', '') or '')
    studyGroup = str(payload.get('studyGroup', '') or '')
    style_preset = str(payload.get('stylePreset', DEFAULT_TTS_STYLE_PRESET) or DEFAULT_TTS_STYLE_PRESET)
    requested_voice = payload.get('ttsVoice')
    if requested_voice is None or str(requested_voice).strip() == "":
        requested_voice = payload.get('voicePreference')
    raw_turn_preset = payload.get('turnPreset')
    has_turn_preset_override = isinstance(raw_turn_preset, str) and raw_turn_preset.strip() != ""
    turn_preset_override = normalize_turn_preset(raw_turn_preset) if has_turn_preset_override else None
    turn_preset = TURN_PRESET_DEFAULT
    studyGroup_to_save = studyGroup if studyGroup != "" else "NA"
    phase_meta_payload = {
        "suggestion": "none"
    }
    title = "Laufende Reflexion" if language == "de" else "Ongoing Reflection"
    try:
        lock.acquire()
        conversations = load("conversations")
        lock.release()
        response = ""
        most_similar_question = None
        conversation_entry = None
        existing_conversation = None
        stage_for_prompt = ""
        if username in conversations:
            existing_conversation = conversation_with_id(conversations[username], conversationID)
            if existing_conversation is not None:
                stage_for_prompt = existing_conversation.get("stage", "")
        stored_turn_preset = None
        if existing_conversation is not None:
            stored_turn_preset = existing_conversation.get("turnPreset", TURN_PRESET_DEFAULT)
        turn_preset = turn_preset_override if turn_preset_override else normalize_turn_preset(stored_turn_preset if stored_turn_preset else TURN_PRESET_DEFAULT)
        current_phase_turns_value = 0
        if existing_conversation is not None:
            current_phase_turns_value = existing_conversation.get("currentPhaseTurns", 0)
        phase_reference_stage = stage_for_prompt if stage_for_prompt else (setOfStages[0] if len(setOfStages) > 0 else "")
        phase_turn_rule = get_phase_turn_rule(phase_reference_stage, turn_preset)
        skip_classifier_due_to_min = current_phase_turns_value < phase_turn_rule.get("min", 0)
        phase_meta_payload["turnPreset"] = turn_preset
        phase_meta_payload["turnRules"] = phase_turn_rule
        phase_context_snapshot = build_phase_metadata(stage_for_prompt)
        reflection_context = {
            "current_phase": phase_context_snapshot.get("currentStage"),
            "phase_is_finished": phase_context_snapshot.get("isFinished", False),
            "style_preset": style_preset,
            "language": language,
            "phase_turns_elapsed": 0
        }
        reflection_context["phase_turns_elapsed"] = current_phase_turns_value
        reflection_context["turn_preset"] = turn_preset
        reflection_context["phase_turn_min"] = phase_turn_rule.get("min", 0)
        reflection_context["phase_turn_max"] = phase_turn_rule.get("max", DEFAULT_TURN_CAP)
        reflection_context["skip_phase_classifier"] = skip_classifier_due_to_min
        reflection_summary = None
        if not (username in conversations):
            reflection_context["phase_turns_elapsed"] = 0
            response, most_similar_question, response_meta = askModel(
                newMessage, language, reflection_context=reflection_context, conversation_history=[]
            )
            phase_meta_payload["suggestion"] = response_meta.get("phaseSuggestion", "none")
            phase_meta_payload["calculatedNextPhase"] = response_meta.get("calculatedNextPhase", None)
            reflection_summary = response_meta.get("reflectionSummary", None)
            merge_timing_data(response_meta.get("timings"))
            initial_stage = setOfStages[0] if len(setOfStages) > 0 else ""
            conversation_entry = {
                "id": 0,
                "title": ("Laufende Reflexion" if language == "de" else "Ongoing Reflection"),
                "studyGroup": studyGroup_to_save,
                "time": current_time,
                "text": "",
                "stage": initial_stage,
                "turnPreset": turn_preset,
                "messages": [
                    {
                        "sender": "user",
                        "content": newMessage,
                        "buttons": [],
                        "video": "",
                        "time": current_time
                    },
                    {
                        "sender": "system",
                        "content": response,
                        "buttons": most_similar_question.buttons,
                        "video": most_similar_question.video,
                        "time": current_time
                    }
                ]
            }
            conversations[username] = [conversation_entry]
        else:
            if existing_conversation is None:
                new_id = len(conversations[username])
                reflection_context["phase_turns_elapsed"] = 0
                response, most_similar_question, response_meta = askModel(
                    newMessage, language, reflection_context=reflection_context, conversation_history=[]
                )
                phase_meta_payload["suggestion"] = response_meta.get("phaseSuggestion", "none")
                phase_meta_payload["calculatedNextPhase"] = response_meta.get("calculatedNextPhase", None)
                reflection_summary = response_meta.get("reflectionSummary", None)
                merge_timing_data(response_meta.get("timings"))
                initial_stage = setOfStages[0] if len(setOfStages) > 0 else ""
                conversation_entry = {
                    "id": new_id,
                    "title": ("Laufende Reflexion" if language == "de" else "Ongoing Reflection"),
                    "studyGroup": studyGroup_to_save,
                    "time": current_time,
                    "text": "",
                    "stage": initial_stage,
                    "turnPreset": turn_preset,
                    "messages": [
                        {
                            "sender": "user",
                            "content": newMessage,
                            "buttons": [],
                            "video": "",
                            "time": current_time
                        },
                        {
                            "sender": "system",
                            "content": response,
                            "buttons": most_similar_question.buttons,
                            "video": most_similar_question.video,
                            "time": current_time
                        }
                    ]
                }
                conversations[username].append(conversation_entry)
            else:
                conversation_entry = existing_conversation
                conversation_entry["turnPreset"] = turn_preset
                reflection_context["phase_turns_elapsed"] = conversation_entry.get("currentPhaseTurns", 0)
                response, most_similar_question, response_meta = askModel(
                    newMessage, language, currentText, reflection_context=reflection_context, conversation_history=conversation_entry.get("messages", [])
                )
                phase_meta_payload["suggestion"] = response_meta.get("phaseSuggestion", "none")
                phase_meta_payload["calculatedNextPhase"] = response_meta.get("calculatedNextPhase", None)
                reflection_summary = response_meta.get("reflectionSummary", None)
                merge_timing_data(response_meta.get("timings"))
                
                if reflection_summary:
                    conversation_entry["summary"] = reflection_summary
                    print(f"Stored reflection summary ({len(reflection_summary)} chars)")
                
                gibMirText = "Gib mir einige praktische Ideen, wie ich mit dem Schreiben meines reflektierenden Textes nach dem Gibbs-Modell beginnen kann." if language == "de" else "Give me some practical ideas on how to start writing my reflective text using the Gibbs model."
                if newMessage == gibMirText:
                    response = ("Ideen für reflektierendes Schreiben:\n" if language == "de" else "Ideas for reflective writing:\n") + response
                title = conversation_entry["title"]
                if len(str(currentText).strip()) > 1:
                    conversation_entry["text"] = str(currentText)
                conversation_entry["messages"].append(
                    {
                        "sender": "user",
                        "content": newMessage,
                        "buttons": [],
                        "video": "",
                        "time": current_time
                    }
                )
                conversation_entry["messages"].append(
                    {
                        "sender": "system",
                        "content": response,
                        "buttons": most_similar_question.buttons,
                        "video": most_similar_question.video,
                        "time": current_time
                    }
                )
        if reflection_summary:
            conversation_entry["summary"] = reflection_summary
            conversation_entry["messages"].append(
                {
                    "sender": "system",
                    "content": reflection_summary,
                    "buttons": [],
                    "video": "",
                    "time": current_time
                }
            )
        if conversation_entry is None:
            raise Exception("Conversation could not be created or retrieved.")
        phase_turns_map = conversation_entry.setdefault("phaseTurns", {})
        current_phase_for_turns = phase_context_snapshot.get("currentStage") or ""
        current_phase_turn_rule = get_phase_turn_rule(current_phase_for_turns, turn_preset)
        new_turn_total = 0
        if current_phase_for_turns:
            new_turn_total = phase_turns_map.get(current_phase_for_turns, 0) + 1
            phase_turns_map[current_phase_for_turns] = new_turn_total

        suggestion_value = phase_meta_payload.get("suggestion", "none")
        calculated_next_phase_value = phase_meta_payload.get("calculatedNextPhase", None)
        current_stage_value = conversation_entry.get("stage", "")
        updated_stage_value = advance_stage_if_needed(
            current_stage_value, 
            suggestion_value, 
            calculated_next_phase=calculated_next_phase_value,
            turns_elapsed=new_turn_total,
            turn_rule=current_phase_turn_rule
        )
        print(f"DEBUG: Stage update: {current_stage_value} -> {updated_stage_value} (suggestion: {suggestion_value}, calculated: {calculated_next_phase_value})")
        conversation_entry["stage"] = updated_stage_value

        updated_phase_snapshot = build_phase_metadata(updated_stage_value)
        updated_phase_name = updated_phase_snapshot.get("currentStage")
        if updated_phase_name and updated_phase_name != current_phase_for_turns:
            conversation_entry["currentPhaseTurns"] = 0
        else:
            conversation_entry["currentPhaseTurns"] = new_turn_total
        title = conversation_entry.get("title", title)
        to_return_text = conversation_entry.get("text", "")
        to_return_stage = conversation_entry.get("stage", "")
        conversation_id_to_return = conversation_entry.get("id", 0)
        lock.acquire()
        save("conversations", conversations)
        lock.release()
        phase_info = build_phase_metadata(conversation_entry.get("stage", ""))
        if most_similar_question is None:
            most_similar_question = SimpleNamespace(buttons = [], video = "")
        tts_eligible = True if str(response).strip() != "" else False
        tts_start = time.perf_counter()
        synthesized_audio, resolved_style = synthesize_speech(response, tts_eligible, style_preset, requested_voice)
        timing_info["tts"] = time.perf_counter() - tts_start
        tts_payload = {
            "enabled": synthesized_audio is not None,
            "mode": tts_config.get("mode", "none"),
            "stylePreset": resolved_style["style_preset"],
            "voice": resolved_style["voice"],
            "allowedVoices": tts_config.get("allowed_voices", [])
        }
        if synthesized_audio is not None:
            if has_request_context():
                tts_payload["audioUrl"] = url_for('serve_tts_audio', audio_id=synthesized_audio["audio_id"])
            else:
                tts_payload["audioUrl"] = f"/tts/audio/{synthesized_audio['audio_id']}"

        timing_labels = [
            ("transcription", "Whisper"),
            ("classification", "Classifier"),
            ("response_generation", "Response"),
            ("tts", "TTS")
        ]
        timing_parts = []
        for key, label in timing_labels:
            value = timing_info.get(key)
            if isinstance(value, (int, float)):
                timing_parts.append(f"{label}: {value:.3f}s")
        if timing_parts:
            print("DEBUG: Turn timing summary => " + " | ".join(timing_parts))
        else:
            print("DEBUG: Turn timing summary => No timing data collected.")

        return {
            "success": True,
            "result": response,
            "assistantText": response, # explicit TTS-ready text
            "ttsEligible": tts_eligible,
            "tts": tts_payload,
            "buttons": most_similar_question.buttons,
            "video": most_similar_question.video,
            "title": title,
            "time": current_time,
            "text": to_return_text,
            "stage": to_return_stage,
            "id": conversation_id_to_return,
            "turnPreset": turn_preset,
            "phase": phase_info,
            "phaseMeta": phase_meta_payload,
            "reflectionSummary": conversation_entry.get("summary", None),
            "summaryMessage": reflection_summary
        }
    except Exception as error:
        print("Error in 'new_chat' ==>", error)
        if lock.locked():
            lock.release()
        fallback_style = get_tts_style_config(style_preset, requested_voice)
        tts_payload = {
            "enabled": False,
            "mode": tts_config.get("mode", "none"),
            "stylePreset": fallback_style["style_preset"],
            "voice": fallback_style["voice"],
            "allowedVoices": tts_config.get("allowed_voices", [])
        }
        return {
            "success": False,
            "result": "",
            "assistantText": "",
            "ttsEligible": False,
            "tts": tts_payload,
            "buttons": [],
            "video": "",
            "title": "",
            "time": current_time,
            "text": "",
            "stage": "",
            "id": 0,
            "turnPreset": turn_preset,
            "phase": build_phase_metadata(""),
            "phaseMeta": phase_meta_payload,
            "reflectionSummary": None,
            "summaryMessage": None
        }

def process_voice_job_async(job_id, audio_path, payload):
    update_voice_job(job_id, status="running", error=None)
    try:
        language_hint = str((payload or {}).get("language", "") or "").strip()
        transcription_start = time.perf_counter()
        with open(audio_path, "rb") as audio_file:
            transcription_kwargs = {
                "model": "whisper-1",
                "file": audio_file
            }
            if language_hint != "":
                transcription_kwargs["language"] = language_hint
            transcription = openai_client.audio.transcriptions.create(**transcription_kwargs)
        transcription_duration = time.perf_counter() - transcription_start
        transcript_text = (getattr(transcription, "text", "") or "").strip()
        if transcript_text == "":
            raise ValueError("Transcription returned no text.")
        chat_payload = dict(payload or {})
        chat_payload["newMessage"] = transcript_text
        timing_metadata = dict(chat_payload.get("timingMetadata", {}))
        timing_metadata["transcription"] = transcription_duration
        chat_payload["timingMetadata"] = timing_metadata
        chat_result = process_chat_turn(chat_payload)
        chat_result["userMessage"] = transcript_text
        chat_result["transcript"] = transcript_text
        update_voice_job(job_id, status="completed", result=chat_result, error=None)
    except Exception as error:
        print("Error in async voice job ==>", error)
        update_voice_job(job_id, status="failed", error=str(error))
    finally:
        try:
            os.remove(audio_path)
        except Exception:
            pass

@app.route('/newChat', methods=['POST'])
def new_chat():
    payload = request.get_json(force=True, silent=True) or {}
    result = process_chat_turn(payload)
    return jsonify(result)

@app.route('/voiceJobStatus', methods=['GET'])
def voice_job_status():
    job_id = request.args.get('jobId') or request.args.get('job_id')
    if not job_id:
        payload = request.get_json(silent=True) or {}
        job_id = payload.get('jobId') or payload.get('job_id')
    if not job_id:
        return jsonify({"success": False, "error": "Missing jobId"}), 400
    job_entry = get_voice_job(job_id)
    if job_entry is None:
        return jsonify({"success": False, "error": "Job not found"}), 404
    return jsonify({
        "success": True,
        "status": job_entry.get("status", "pending"),
        "result": job_entry.get("result"),
        "error": job_entry.get("error")
    })


if __name__ == '__main__':
    app.run(host = '0.0.0.0', port = 5001, debug = True)
