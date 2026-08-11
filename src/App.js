import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./Login";
import Signup from "./Signup";
import StateGovDashboard from "./StateGovDashboard";
import NodalDashboard from "./NodalDashboard";
import MinistriesDashboard from "./MinistriesDashboard";
import SLECDashboard from "./SLECDashboard";
import { LanguageProvider } from "./LanguageContext";

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login/>} />
          <Route path="/signup" element={<Signup/>} />
          <Route path="/dashboard/state" element={<StateGovDashboard/>} />
          <Route path="/dashboard/nodal" element={<NodalDashboard/>} />
          <Route path="/dashboard/ministries" element={<MinistriesDashboard/>} />
          <Route path="/dashboard/slec" element={<SLECDashboard/>} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}

export default App;