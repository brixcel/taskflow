import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

function App() {
  return (
    <Routes>
      <Route path="/"                 element={<Login />} />
      <Route path="/register"         element={<Register />} />
      <Route path="/onboarding"       element={<Onboarding />} />
      <Route path="/dashboard"        element={<Dashboard />} />
      <Route path="/forgot-password"  element={<ForgotPassword />} />
      <Route path="/reset-password"   element={<ResetPassword />} />
    </Routes>
  );
}

export default App;
