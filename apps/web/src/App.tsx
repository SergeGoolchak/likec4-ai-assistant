import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProjectsPage } from './pages/ProjectsPage';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { ProjectDashboardPage } from './pages/ProjectDashboardPage';
import { ArchitectureRulesPage } from './pages/ArchitectureRulesPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<CreateProjectPage />} />
        <Route path="/projects/:id" element={<ProjectDashboardPage />} />
        <Route path="/projects/:id/architecture-rules" element={<ArchitectureRulesPage />} />
      </Route>
    </Routes>
  );
}
