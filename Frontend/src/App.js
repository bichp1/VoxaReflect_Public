// # Hippo

// # ========= IMPORTANT NOTICE =========
// # This code is by no ways a complete program and is only considered an initial working prototype.
// # Thus, no security, scalability, etc. practices are included in the code.
// # We don't provide any guarantee on any aspect of this application. To deploy the code in a real environment,
// # other aspects of software development need to be done, and a team of DevOps, program security engineers and developers
// # should overtake the project when producing the final software.

import './App.css';
import React from 'react';
import Backdrop from '@mui/material/Backdrop';
import CircularProgress from '@mui/material/CircularProgress';
import LoginPage from './LoginPage';
import MainPage from './MainPage';

const rawAllTipsDE = [
  "",
  "Reflektierendes Schreiben fördert Selbstbewusstsein und Selbstreflexion.",
  "Die Verwendung des Gibbs-Modells fördert kritisches Denken.",
  "Reflektierendes Schreiben fördert persönliches Wachstum und Entwicklung.",
  "Das Gibbs-Modell bietet einen strukturierten Rahmen für die Analyse.",
  "Reflexion fördert ein tieferes Verständnis von Erfahrungen und Emotionen.",
  "Das Gibbs-Modell hilft, Stärken und Bereiche zur Verbesserung zu identifizieren.",
  "Reflexion fördert Resilienz durch das Lernen aus Rückschlägen und Herausforderungen.",
  "Die Verwendung des Gibbs-Modells unterstützt eine effektive Kommunikation von Erkenntnissen und Lektionen.",
  "Durch reflektierendes Schreiben können neue Einsichten und Lösungsansätze entstehen.",
  "Das Gibbs-Modell bietet eine strukturierte Methode, um komplexe Probleme zu analysieren.",
  "Die Verwendung des Gibbs-Modells erleichtert das Lernen aus Erfolgen sowie Misserfolgen.",
  "Reflektierendes Schreiben unterstützt die Entwicklung von kreativen Denk- und Problemlösungsfähigkeiten."
];

const rawAllTipsEN = [
  "",
  "Reflective writing promotes self-confidence and self-reflection.",
  "Using the Gibbs model promotes critical thinking.",
  "Reflective writing promotes personal growth and development.",
  "The Gibbs model provides a structured framework for analysis.",
  "Reflection promotes a deeper understanding of experiences and emotions.",
  "The Gibbs model helps identify strengths and areas for improvement.",
  "Reflection promotes resilience by learning from setbacks and challenges.",
  "Using the Gibbs model supports effective communication of insights and lessons.",
  "Reflective writing can lead to new insights and approaches to solutions.",
  "The Gibbs model provides a structured method for analyzing complex problems.",
  "Using the Gibbs model facilitates learning from successes as well as failures.",
  "Reflective writing supports the development of creative thinking and problem-solving skills."
];

const THEME_STORAGE_KEY = "voxareflect-theme";
const resolveInitialTheme = () => {
  if (typeof window === "undefined") {
    return "light";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
};

const allTips = (language) => language === "de" ? rawAllTipsDE : rawAllTipsEN;

function App() {
  const [currentPage, setCurrentPage] = React.useState("login"); // login - main
  const [isLoadingIndicatorOpen, setLoadingIndicatorOpenState] = React.useState(false);
  const [conversations, setConversations] = React.useState([]);
  const [username, setUsername] = React.useState("");
  const [currentTip, setCurrentTip] = React.useState(0);
  const [theme, setTheme] = React.useState(resolveInitialTheme);

  React.useEffect(() => {
    document.body.classList.toggle("dark-theme", theme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => prev === "dark" ? "light" : "dark");

  const setLoadingIndicatorOpen = (value, shouldShowATip) => {
    if (shouldShowATip === false) {
      setCurrentTip(0);
      setTimeout(() => setLoadingIndicatorOpenState(value), 100);
      return;
    }
    if (value === true) {
      const allTipsLanguage = allTips(language);
      const randomNumber = Math.floor(Math.random() * (allTipsLanguage.length - 1)) + 1;
      setCurrentTip(Math.max(1, Math.min(randomNumber, allTipsLanguage.length - 1)));
    }
    setTimeout(() => setLoadingIndicatorOpenState(value), 100);
  };

  const urlParams = new URLSearchParams(window.location.search);
  let language = urlParams.get('lang');
  if (!language || (language !== "de" && language !== "en")) {
    alert("This URL is incorrect. Please enter the correct URL. Otherwise, the app will not work properly.");
    return (<div></div>);
  }

  let shouldHaveMic = urlParams.get('mic');
  if (shouldHaveMic == null || shouldHaveMic.trim() === "") {
    alert(language === "de" ? "Diese URL ist falsch. Bitte gib die korrekte URL ein. Die App wird nicht richtig funktionieren." : "This URL is incorrect. Please enter the correct URL. Otherwise, the app will not work properly.");
    return (<div></div>);
  }
  shouldHaveMic = (("" + shouldHaveMic) === "1");

  let shouldHaveAvatar = urlParams.get('ava');
  if (shouldHaveAvatar == null || shouldHaveAvatar.trim() === "") {
    alert(language === "de" ? "Diese URL ist falsch. Bitte gib die korrekte URL ein. Die App wird nicht richtig funktionieren." : "This URL is incorrect. Please enter the correct URL. Otherwise, the app will not work properly.");
    return (<div></div>);
  }
  shouldHaveAvatar = (("" + shouldHaveAvatar) === "1");

  const urlGroup = urlParams.get('group');
  const studyGroup = "" + urlGroup;
  if (studyGroup == null || studyGroup.trim() === "") {
    alert(language === "de" ? "Diese URL ist falsch. Bitte gib die korrekte URL ein. Die App wird nicht richtig funktionieren." : "This URL is incorrect. Please enter the correct URL. Otherwise, the app will not work properly.");
    return (<div></div>);
  }

  return (
    <>
      {currentPage === "login" && (
        <LoginPage
          language={language}
          setCurrentPage={setCurrentPage}
          setLoadingIndicatorOpen={setLoadingIndicatorOpen}
          setConversations={setConversations}
          setUsername={setUsername}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}
      {currentPage === "main" && (
        <MainPage
          language={language}
          shouldHaveMic={shouldHaveMic}
          shouldHaveAvatar={shouldHaveAvatar}
          studyGroup={studyGroup}
          setCurrentPage={setCurrentPage}
          setLoadingIndicatorOpen={setLoadingIndicatorOpen}
          username={username}
          conversations={conversations}
          setConversations={setConversations}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}

      <Backdrop
        sx={{ color: theme === "dark" ? "#f8fafc" : "black", zIndex: (muiTheme) => muiTheme.zIndex.drawer + 1 }}
        open={isLoadingIndicatorOpen}
      >
        <div
          style={{
            backgroundColor: theme === "dark" ? "rgba(4, 11, 25, 0.9)" : "rgba(225, 225, 225, 0.8)",
            paddingTop: "60px",
            paddingBottom: "60px",
            paddingLeft: "100px",
            paddingRight: "100px",
            borderRadius: "40px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            color: theme === "dark" ? "#f8fafc" : "black"
          }}
        >
          <CircularProgress color="inherit" />
          {currentTip !== 0 && (
            <>
              <br /> <br />
              <div style={{ fontWeight: 'bold', fontSize: '160%' }}>
                {language === "de" ? "Lädt..." : "Loading..."}
              </div>
              <br /> <br /> <br /> <br />
              <div style={{ fontWeight: 'bold', fontSize: '160%' }}>
                💡 {language === "de" ? " Wusstest du das?" : " Did you know?"}
              </div>
              <br /> <br />
              <div style={{ fontSize: '160%' }}><em>{allTips(language)[currentTip]}</em></div>
            </>
          )}
        </div>
      </Backdrop>
    </>
  );
}

export default App;
