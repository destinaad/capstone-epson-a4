import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';
import InspectionsPage from './pages/InspectionsPage';
import PartsPage from './pages/PartsPage';
import AuditPage from './pages/AuditPage';
import RoleHome from './components/RoleHome';
import LoginPage from './pages/LoginPage';
import PerformancePage from './pages/PerformancePage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<RoleHome />} />
            <Route path="inspections" element={<InspectionsPage />} />
            <Route path="parts" element={<PartsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="performance" element={<PerformancePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
