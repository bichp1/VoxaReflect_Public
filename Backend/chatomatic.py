import json
import time
from types import SimpleNamespace

# Import the reflection system prompt builder
from reflection_system_prompt import build_reflection_system_prompt, get_phase_metadata

# Try to load the model name from environment or use default
import os
VOXAREFLECT_LLM_MODEL = os.environ.get("VOXAREFLECT_LLM_MODEL", "").strip()
if VOXAREFLECT_LLM_MODEL == "":
    VOXAREFLECT_LLM_MODEL = "gpt-5.1"

VOXAREFLECT_CLASSIFIER_MODEL = os.environ.get("VOXAREFLECT_CLASSIFIER_MODEL", "").strip()
if VOXAREFLECT_CLASSIFIER_MODEL == "":
    VOXAREFLECT_CLASSIFIER_MODEL = VOXAREFLECT_LLM_MODEL  # fall back to main model


class GPTResponse:
    def __init__(self, answers, buttons=None, video="", phase_suggestion="none", calculated_next_phase=None, reflection_summary=None):
        self.answers = answers
        self.buttons = buttons if buttons is not None else []
        self.video = video
        self.phase_suggestion = phase_suggestion
        self.calculated_next_phase = calculated_next_phase
        self.reflection_summary = reflection_summary

class Chatomatic:
    def __init__(self, openai_client):
        self.openai_client = openai_client

    def askGPT(self, question, language_for_app, current_text, reflection_context=None, conversation_history=None):
        # Gather reflection-specific context for the system prompt builder.
        context = reflection_context or {
            "language": language_for_app,
            "current_phase": None,
            "phase_is_finished": False,
            "style_preset": None,
            "phase_turns_elapsed": 0,
        }
        timings = {}
        skip_phase_classifier = bool(context.get("skip_phase_classifier", False))
        # System prompt content lives in reflection_system_prompt.py for easier editing.
        system_message = build_reflection_system_prompt(context)
        if len(str(current_text).strip()) > 5:
            system_message += "\n\nThis is the reflective text of the student so far:\n" + str(current_text).strip()
        
        # Build messages with recent conversation context (last 6 messages = 3 turns)
        messages = [{"role": "system", "content": system_message}]
        recent_history_block = ""
        classifier_history_block = ""
        if conversation_history and len(conversation_history) > 0:
            recent_messages = conversation_history[-12:]  # Last 6 turns
            formatted_history = []
            for msg in recent_messages:
                sender = msg.get("sender")
                content = msg.get("content", "")
                if sender == "user":
                    formatted_history.append(f"Student: {content}")
                    messages.append({"role": "user", "content": content})
                elif sender == "system":
                    formatted_history.append(f"Coach: {content}")
                    messages.append({"role": "assistant", "content": content})
            if formatted_history:
                recent_history_block = "\n\nRecent conversation history (last 6 turns):\n" + "\n".join(formatted_history)

            phase_turns_elapsed = int(context.get("phase_turns_elapsed", 0) or 0)
            classifier_recent = []
            if phase_turns_elapsed > 0:
                classifier_slice_count = min(len(conversation_history), phase_turns_elapsed * 2)
                classifier_recent = conversation_history[-classifier_slice_count:]
            formatted_classifier_history = []
            for msg in classifier_recent:
                sender = msg.get("sender")
                content = msg.get("content", "")
                if sender == "user":
                    formatted_classifier_history.append(f"Student: {content}")
                elif sender == "system":
                    formatted_classifier_history.append(f"Coach: {content}")
            if formatted_classifier_history:
                turn_label = "current phase"
                if phase_turns_elapsed == 1:
                    span_label = "last turn in current phase"
                else:
                    span_label = f"last {phase_turns_elapsed} turns in current phase"
                classifier_history_block = f"\n\nRecent conversation history ({span_label}):\n" + "\n".join(formatted_classifier_history)
        
        # Add current question
        messages.append({"role": "user", "content": question})
        
        phase_suggestion = "none"
        new_result = ""
        updated_phase = context.get("current_phase")  # Track potentially updated phase
        
        print("=" * 50)
        print("DEBUG: Starting askGPT method")
        print(f"DEBUG: Question: {question[:100]}...")
        print(f"DEBUG: Current phase: {updated_phase}")
        print("=" * 50)
        
        try:
            # ========== STEP 1: Phase Decision with Clear Criteria ==========
            
            current_phase_name = context.get('current_phase', 'Description')
            phase_metadata = get_phase_metadata(current_phase_name)
            criteria = phase_metadata.get("goal", "Student has addressed the current phase.")
            depth_cue = phase_metadata.get("depth_cue", "Ask clarifying follow-ups if the response is vague.")
            turn_target = phase_metadata.get("turn_target", 4)
            context_turn_max = context.get("phase_turn_max")
            if isinstance(context_turn_max, (int, float)):
                turn_target = int(context_turn_max)
            turn_minimum = context.get("phase_turn_min", 0)
            turns_elapsed = context.get("phase_turns_elapsed", 0)
            
            phase_decision_prompt = (
                f"You are evaluating if a student can advance from the '{current_phase_name}' phase of Gibbs reflection.\n\n"
                f"**Phase goal:** {criteria}\n"
                f"**Depth cue:** {depth_cue}\n"
                f"**Suggested maximum turns for this phase:** {turn_target}\n"
            )
            if isinstance(turn_minimum, int) and turn_minimum > 0:
                phase_decision_prompt += f"**Minimum turns before evaluating advance:** {turn_minimum}\n"
            phase_decision_prompt += (
                f"**Turns used so far:** {turns_elapsed}\n\n"
                f"**Student's response:** {question}\n"
            )
            if classifier_history_block:
                phase_decision_prompt += f"{classifier_history_block}\n"
            phase_decision_prompt += (
                "\nAnalyze the depth and completeness of the student's response.\n"
                "Use the turn guidance to keep the reflection moving: if the essentials are covered and the student reached the suggested maximum, lean toward \"advance\". Only choose \"stay\" when key elements are still missing, even if that exceeds the target.\n"
                "Output ONLY a JSON object:\n"
                '{"suggestion": "advance"} if criteria are clearly met\n'
                '{"suggestion": "stay"} if response does not meet the criteria\n'
            )

            phase_response = None
            if skip_phase_classifier:
                print("DEBUG: Skipping phase decision classifier due to minimum turn requirement.")
                phase_suggestion = "stay"
                timings["classification"] = 0.0
            else:
                print("=" * 70)
                print("DEBUG: Phase decision classifier payload:")
                print(f"MODEL: {VOXAREFLECT_CLASSIFIER_MODEL}")
                print("INSTRUCTIONS:")
                print(phase_decision_prompt)
                print("-" * 70)
                print("INPUT:")
                print(question)
                print("=" * 70)

                classifier_start = time.perf_counter()
                try:
                    phase_response = self.openai_client.responses.create(
                        model=VOXAREFLECT_CLASSIFIER_MODEL,
                        instructions=phase_decision_prompt,
                        input=question,
                        temperature=1.0,
                        reasoning={"effort": "low"}
                    )
                finally:
                    timings["classification"] = time.perf_counter() - classifier_start

                print("DEBUG: Phase decision API call completed")
                print(f"DEBUG: Phase response type: {type(phase_response)}")
                
                # Parse JSON from text response
                phase_text = None
                if hasattr(phase_response, 'output_text') and phase_response.output_text:
                    phase_text = phase_response.output_text.strip()
                elif hasattr(phase_response, 'output') and isinstance(phase_response.output, list):
                    for item in phase_response.output:
                        if hasattr(item, 'type') and item.type == 'message':
                            if hasattr(item, 'content') and isinstance(item.content, list):
                                for content_item in item.content:
                                    if hasattr(content_item, 'text'):
                                        phase_text = content_item.text.strip()
                                        break
                        if phase_text:
                            break
                
                print(f"DEBUG: Phase decision text: {phase_text}")
                
                # Parse the JSON
                if phase_text:
                    try:
                        phase_text = phase_text.replace('```json', '').replace('```', '').strip()
                        phase_data = json.loads(phase_text)
                        phase_suggestion = phase_data.get("suggestion", "none").lower()
                        if phase_suggestion in ["stay", "advance", "none"]:
                            print(f"DEBUG: Phase suggestion parsed: {phase_suggestion}")
                        else:
                            print(f"WARNING: Unexpected phase suggestion: {phase_suggestion}")
                            phase_suggestion = "none"
                    except (json.JSONDecodeError, KeyError, AttributeError) as e:
                        print(f"ERROR: Failed to parse phase decision JSON: {e}")
                        phase_suggestion = "none"
            
            # ========== CALCULATE NEXT PHASE ==========
            if phase_suggestion == "advance" and updated_phase:
                stage_sequence = ['Description', 'Feelings', 'Evaluation', 'Analysis', 'Conclusion', 'Action Plan', 'done']
                if updated_phase in stage_sequence:
                    current_index = stage_sequence.index(updated_phase)
                    if current_index < len(stage_sequence) - 1:
                        updated_phase = stage_sequence[current_index + 1]
                        print(f"DEBUG: Advancing phase from {context.get('current_phase')} to {updated_phase}")
            
            # ========== STEP 2: Response Generation with Clean Prompt ==========
            updated_context = dict(context)
            updated_context["current_phase"] = updated_phase
            updated_context["phase_is_finished"] = (updated_phase == "done")
            
            # Clean prompt - no override needed!
            updated_system_message = build_reflection_system_prompt(updated_context)
            if len(str(current_text).strip()) > 5:
                updated_system_message += "\n\nThis is the reflective text of the student so far:\n" + str(current_text).strip()
            if recent_history_block:
                updated_system_message += recent_history_block
            if updated_phase == "done":
                updated_system_message += (
                    "\n\n# Final Turn Instructions\n"
                    "Thank the student for their last response, confirm the reflection is complete, and inform them you are generating a short summary that will appear next. "
                    "Do not include the summary itself in this reply."
                )
            
            print("=" * 70)
            print("DEBUG: NOW CALLING STEP 2 - RESPONSE GENERATION (separate API call)")
            print("=" * 70)
            print(f"DEBUG: System message length: {len(updated_system_message)} chars")
            print("=" * 70)
            print("DEBUG: Response generation payload:")
            print(f"MODEL: {VOXAREFLECT_LLM_MODEL}")
            print("INSTRUCTIONS:")
            print(updated_system_message)
            print("-" * 70)
            print("INPUT:")
            print(question)
            print("=" * 70)

            response_call_start = time.perf_counter()
            try:
                msg = self.openai_client.responses.create(
                    model=VOXAREFLECT_LLM_MODEL,
                    instructions=updated_system_message,
                    input=question,
                    temperature=1.0,
                    reasoning={"effort": "low"}
                )
            finally:
                timings["response_generation"] = time.perf_counter() - response_call_start

            print("DEBUG: STEP 2 COMPLETED")
            print(f"DEBUG: Step 2 response type: {type(msg)}")
            print(f"DEBUG: Step 2 response id: {getattr(msg, 'id', 'NO ID')}")
            
            # Check for reasoning content
            if hasattr(msg, 'reasoning') and msg.reasoning:
                print("=" * 70)
                print("🧠 REASONING CONTENT:")
                print("=" * 70)
                print(msg.reasoning)
                print("=" * 70)
            else:
                print("DEBUG: No reasoning content in response")
            
            print(f"DEBUG: Step 1 phase_response id: {getattr(phase_response, 'id', 'NO ID')}")
            print(f"DEBUG: Are they the same object? {msg is phase_response}")
            
            # Extract text response
            new_result = None
            
            # Method 1: Direct output_text attribute
            if hasattr(msg, "output_text") and msg.output_text:
                new_result = msg.output_text
                print(f"DEBUG: Got result from output_text")
            
            # Method 2: output attribute with message type
            if not new_result and hasattr(msg, "output"):
                output_items = msg.output if isinstance(msg.output, list) else [msg.output]
                for item in output_items:
                    item_type = getattr(item, "type", "")
                    if item_type == "message":
                        content_list = getattr(item, "content", [])
                        for content_item in content_list:
                            content_type = getattr(content_item, "type", "")
                            if content_type == "output_text" or content_type == "text":
                                text_value = getattr(content_item, "text", None)
                                if text_value:
                                    new_result = text_value
                                    print(f"DEBUG: Got result from output[].content[].text")
                                    break
                    if new_result:
                        break
            
            # Ensure we have a string, even if empty
            if not isinstance(new_result, str):
                new_result = ""
                print("WARNING: No valid response text found, using empty string")
            
            # ========== STEP 3: Generate Summary if Reflection Complete ==========
            summary_text = None
            reflective_text = str(current_text or "").strip()
            total_history_chars = 0
            if conversation_history:
                for msg_item in conversation_history:
                    total_history_chars += len(str(msg_item.get("content", "")))
            has_reflection_content = len(reflective_text) > 0 or total_history_chars > 0

            # Check if we've reached the end of reflection
            if updated_phase == "done":
                # Only skip if there is literally nothing to summarise
                if has_reflection_content:
                    print("=" * 70)
                    print("SUMMARY: Generating reflection summary with medium reasoning")
                    print("=" * 70)
                    
                    # Build full conversation history for summary
                    summary_context = (
                        "You are a reflective learning expert analyzing a completed student reflection.\n\n"
                        "The student has completed a Gibbs reflection cycle through a guided conversation. "
                        "Review the entire conversation below to understand their journey.\n\n"
                        "Provide a comprehensive summary that includes:\n\n"
                        "1. **Key Insights** (2-3 sentences): What did they learn? What connections did they make between their experience and theory?\n"
                        "2. **Action Plans** (bullet points): What concrete steps did they commit to? Be specific.\n"
                        "3. **Growth Observed** (1-2 sentences): How did their understanding evolve from description to action?\n\n"
                        "Keep it concise, actionable, and supportive.\n\n"
                        "Ensure that the language of the summary is the same as the language used in the conversation.\n\n"
                        "--- CONVERSATION HISTORY ---\n\n"
                    )
                    
                    # Include FULL conversation history for summary
                    if conversation_history:
                        for msg_item in conversation_history:
                            sender = "Student" if msg_item.get("sender") == "user" else "Coach"
                            summary_context += f"{sender}: {msg_item.get('content', '')}\n\n"
                    
                    # Add current exchange
                    summary_context += f"Student: {question}\n\n"
                    summary_context += f"Coach: {new_result}\n\n"
                    summary_context += "--- END OF CONVERSATION ---\n\n"
                    summary_context += f"Student's accumulated reflection text:\n{reflective_text}\n\n"
                    summary_context += "Now provide your summary analysis in the correct language."
                    
                    try:
                        summary_response = self.openai_client.responses.create(
                            model=VOXAREFLECT_LLM_MODEL,
                            instructions="You are an expert in reflective learning and student development. Analyze thoughtfully and provide actionable feedback.",
                            input=summary_context,
                            temperature=1.0,
                            reasoning={"effort": "medium"}
                        )
                        
                        # Extract summary text
                        if hasattr(summary_response, 'output_text') and summary_response.output_text:
                            summary_text = summary_response.output_text
                        elif hasattr(summary_response, 'output') and isinstance(summary_response.output, list):
                            for item in summary_response.output:
                                if hasattr(item, 'content') and isinstance(item.content, list):
                                    for content_item in item.content:
                                        if hasattr(content_item, 'text'):
                                            summary_text = content_item.text
                                            break
                        
                        # Check for reasoning content
                        if hasattr(summary_response, 'reasoning') and summary_response.reasoning:
                            print("=" * 70)
                            print("SUMMARY REASONING:")
                            print("=" * 70)
                            print(summary_response.reasoning)
                            print("=" * 70)
                        
                        if summary_text:
                            print(f"DEBUG: Generated summary ({len(summary_text)} chars)")
                        else:
                            print("WARNING: Summary generation returned empty text")
                    
                    except Exception as summary_error:
                        print(f"ERROR generating summary: {type(summary_error).__name__}: {summary_error}")
                        summary_text = None
                else:
                    print("DEBUG: Skipping summary - no reflection content available")

            # Validate phase_suggestion
            if phase_suggestion not in {"stay", "advance", "none"}:
                phase_suggestion = "none"
        except Exception as e:
            # Fall back to the legacy chat completions API when the Responses API fails or is unavailable.
            print(f"ERROR: Exception in Responses API: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            
            # Convert "system" to "developer" role for GPT-5.1 best practices
            messages_updated = []
            for msg_item in messages:
                if msg_item["role"] == "system":
                    messages_updated.append({"role": "developer", "content": msg_item["content"]})
                else:
                    messages_updated.append(msg_item)
            
            print("DEBUG: Using fallback Chat Completions API")
            fallback_start = time.perf_counter()
            msg = self.openai_client.chat.completions.create(
                model=VOXAREFLECT_LLM_MODEL,
                messages=messages_updated,
                temperature=1.0  # GPT-5.1 requires temperature=1.0 exactly
            )
            timings["response_generation"] = time.perf_counter() - fallback_start
            new_result = msg.choices[0].message.content
            print(f"DEBUG: Fallback result: {new_result[:100] if new_result else 'None'}...")
            
            # Phase suggestion stays "none" in fallback since we can't determine it
            phase_suggestion = "none"
            summary_text = None
        
        
        # CRITICAL: Ensure we never return None - frontend expects strings
        if new_result is None or not isinstance(new_result, str):
            print(f"WARNING: new_result was {type(new_result)}, converting to empty string")
            new_result = ""
        
        # Structured metadata hook for phase progression
        # Return both the suggestion (stay/advance/none) AND the calculated next phase
        meta = {
            "phaseSuggestion": phase_suggestion,
            "calculatedNextPhase": updated_phase,
            "reflectionSummary": summary_text,
            "timings": timings
        }
        print(f"DEBUG: Returning meta: {meta}")
        return new_result, meta

    def answer(self, question, language_for_app, current_text, reflection_context=None, conversation_history=None):
        # Generate response directly with GPT
        completion, meta = self.askGPT(question, language_for_app, current_text, reflection_context, conversation_history=conversation_history)
        
        # Create GPTResponse object
        gpt_response = GPTResponse(
            [completion], 
            phase_suggestion=meta.get("phaseSuggestion", "none"),
            calculated_next_phase=meta.get("calculatedNextPhase", None),
            reflection_summary=meta.get("reflectionSummary", None)
        )
        
        response_meta = {
            "phaseSuggestion": meta.get("phaseSuggestion", "none"),
            "calculatedNextPhase": meta.get("calculatedNextPhase", None),
            "reflectionSummary": meta.get("reflectionSummary", None),
            "timings": meta.get("timings", {})
        }
        
        print(f"DEBUG answer(): Returning response_meta: {response_meta}")
        return completion, gpt_response, response_meta
