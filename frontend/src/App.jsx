import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import Settings from './pages/Settings';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import NotFound from './pages/NotFound';

function App() {
  return (
    <Routes>
      <Route path="/"                 element={<Login />} />
      <Route path="/register"         element={<Register />} />
      <Route path="/onboarding"       element={<Onboarding />} />
      <Route path="/dashboard"        element={<Dashboard />} />
      <Route path="/settings"         element={<Settings />} />
      <Route path="/forgot-password"  element={<ForgotPassword />} />
      <Route path="/reset-password"   element={<ResetPassword />} />
      <Route path="/verify-email"     element={<VerifyEmail />} />
      <Route path="/terms"            element={<Terms />} />
      <Route path="/privacy"          element={<Privacy />} />
      <Route path="*"                 element={<NotFound />} />
    </Routes>
  );
}

export default App;
