// # Hippo

// # ========= IMPORTANT NOTICE =========
// # This code is by no ways a complete program and is only considered an initial working prototype.
// # Thus, no security, scalability, etc. practices are included in the code.
// # We don't provide any guarantee on any aspect of this application. To deploy the code in a real environment,
// # other aspects of software development need to be done, and a team of DevOps, program security engineers and developers
// # should overtake the project when producing the final software.

import './LoginPage.css';
import React from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import voxareflectLogo from './voxareflect_logo.png';

const resolveServerURL = () => {
  const envValue = (process.env.REACT_APP_SERVER_URL || "").trim();
  if (envValue !== "") {
    return envValue.endsWith("/") ? envValue : `${envValue}/`;
  }
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return `${window.location.origin}/`;
  }
  return "http://localhost:5001/";
};

const serverURL = resolveServerURL();

function LoginPage({ language, setCurrentPage, setLoadingIndicatorOpen, setConversations, setUsername, theme, onToggleTheme }) {
  const [usernameInTextField, setUsernameInTextField] = React.useState('');

  const [isForgetCodeDialogOpen, setForgetCodeDialogOpen] = React.useState(false);
  const handleOpenForgetCodeDialog = () => { setForgetCodeDialogOpen(true); };
  const handleCloseForgetCodeDialog = () => { setForgetCodeDialogOpen(false); };

  const getConversations = () => {
    if (usernameInTextField === "") {
      alert(language === "de" ? "Bitte gib deinen Nutzernamen korrekt ein." : "Please enter your username correctly.");
      return;
    }
    setLoadingIndicatorOpen(true, false);
    fetch(serverURL + "getConversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        "username": usernameInTextField,
        "language": language
      })
    })
      .then(response => response.json())
      .then(data => {
        if (data["success"] === true) {
          let result = data["result"];
          result = result.sort((a, b) => { return b["id"] - a["id"]; });
          setConversations(result);
          setTimeout(() => {
            setUsername(usernameInTextField);
            setTimeout(() => {
              setCurrentPage("main");
              setTimeout(() => {
                setLoadingIndicatorOpen(false, false);
              }, 100);
            }, 100);
          }, 100);
        } else {
          setLoadingIndicatorOpen(false, false);
          alert(language === "de" ? "Es ist ein Fehler aufgetreten. Bitte versuche es erneut." : "An error occurred. Please try again.");
        }
      })
      .catch(error => {
        setLoadingIndicatorOpen(false, false);
        console.log(error);
        alert(language === "de" ? "Es ist ein Fehler aufgetreten. Bitte versuche es erneut." : "An error occurred. Please try again.");
      });
  };

  const themeToggleLabel = theme === "dark"
    ? (language === "de" ? "Heller Modus" : "Light mode")
    : (language === "de" ? "Dunkler Modus" : "Dark mode");

  return (
    <>
      <div className='middle-container'>
        <div className='middle-box'>
          <div className='theme-toggle'>
            <button className='theme-toggle-button' onClick={onToggleTheme}>{themeToggleLabel}</button>
          </div>
          <div className='global-logo-banner'>
            <img src={voxareflectLogo} alt="VoxaReflect" className='global-logo-image' />
          </div>
          <div className='welcome-title'>{language === "de" ? "Willkommen bei VoxaReflect!" : "Welcome to VoxaReflect!"}</div> <br /> <br />
          <div className='welcome-subtitle'>{language === "de" ? "Dein smarter Coach für reflektierendes Schreiben" : "Your smart coach for reflective writing"}</div> <br /> <br />
          <input type="text" placeholder={language === "de" ? "Code (Nutzername)" : "Code (Username)"} value={usernameInTextField} onChange={(event) => { setUsernameInTextField(event.target.value) }} className='username-field' />
          <br /> <br /> <br />
          <input type="button" className='login-button' value="Start" onClick={() => getConversations()} />

          <div className='login-info'>
            {language === "de"
              ? <>VoxaReflect befindet sich in der Entwicklung, kann <b>Fehler machen</b> und das Laden der Antworten kann <b>lange dauern.</b></>
              : <>VoxaReflect is in development, can <b>make mistakes</b> and loading the answers can <b>take a long time.</b></>}
            <br /> <br />
            <div className='provide-ideas-link' onClick={() => { handleOpenForgetCodeDialog(); }}>
              {language === "de" ? "Welchen Code muss ich eingeben?" : "What code do I have to enter?"}
            </div>
            <br /> <br />
            {language === "de" && <b>Informationen zum Datenschutz</b>}
            {language === "en" && <b>Privacy</b>}
            <br /> <br />
            {language === "de" && <>VoxaReflect speichert deine Eingaben lokal auf diesem Gerät, damit du mit demselben Code später wieder auf deine Gespräche zugreifen kannst. Die Antworten werden über den OpenAI-Service generiert; außerhalb deines Geräts werden keine personenbezogenen Daten gespeichert.</>}
            {language === "en" && <>VoxaReflect keeps your inputs locally on this device so the same code reopens your reflection. Responses are generated through the OpenAI service, and no personal data is stored anywhere else.</>}
          </div>

        </div>
      </div>

        <Dialog open={isForgetCodeDialogOpen} onClose={handleCloseForgetCodeDialog} scroll={"paper"} aria-labelledby="scroll-dialog-title" aria-describedby="scroll-dialog-description" >
          <DialogTitle id="scroll-dialog-title">
            {language === "de" ? "Welchen Code muss ich eingeben?" : "What code do I have to enter?"}
          </DialogTitle>
        <DialogContent dividers={true}>
          <DialogContentText
            id="scroll-dialog-description"
            tabIndex={-1} >
            <div style={{ fontSize: '105%' }}>
              {language === "de"
                ? <>Du kannst einen beliebigen Code wählen (zum Beispiel Initialen plus eine Zahl). Dieser Code wird nur lokal gespeichert und sorgt dafür, dass du deine Reflexion beim nächsten Besuch wiederfindest. Notiere ihn dir und verwende denselben Code, wenn du zu VoxaReflect zurückkehrst.</>
                : <>Pick any code you like (for example your initials plus a number). The code is stored locally so you can return to the same reflection later. Jot it down somewhere safe and enter the exact same code the next time you use VoxaReflect.</>}
            </div>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseForgetCodeDialog}>{language === "de" ? "Schließen" : "Close"}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default LoginPage;
