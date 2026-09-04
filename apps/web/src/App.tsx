import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProjectsPage } from './pages/ProjectsPage';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { ProjectDashboardPage } from './pages/ProjectDashboardPage';
import { ArchitectureRulesPage } from './pages/ArchitectureRulesPage';
import { ConfluenceSettingsPage } from './pages/ConfluenceSettingsPage';
import { NewTaskPage } from './pages/NewTaskPage';
import { AnalysisPage } from './pages/AnalysisPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<CreateProjectPage />} />
        <Route path="/projects/:id" element={<ProjectDashboardPage />} />
        <Route path="/projects/:id/architecture-rules" element={<ArchitectureRulesPage />} />
        <Route path="/projects/:id/confluence-settings" element={<ConfluenceSettingsPage />} />
        <Route path="/projects/:id/tasks/new" element={<NewTaskPage />} />
        <Route path="/sessions/:id" element={<AnalysisPage />} />
      </Route>
    </Routes>
  );
}
