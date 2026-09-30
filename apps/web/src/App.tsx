import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProjectsPage } from './pages/ProjectsPage';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { ProjectDashboardPage } from './pages/ProjectDashboardPage';
import { ArchitectureRulesPage } from './pages/ArchitectureRulesPage';
import { ConfluenceSettingsPage } from './pages/ConfluenceSettingsPage';
import { AISettingsPage } from './pages/AISettingsPage';
import { NewTaskPage } from './pages/NewTaskPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { ProposalPage } from './pages/ProposalPage';
import { DiffPage } from './pages/DiffPage';
import { PreviewPage } from './pages/PreviewPage';
import { ApplyPage } from './pages/ApplyPage';
import { HistoryPage } from './pages/HistoryPage';
import { HelpCenterPage } from './pages/HelpCenterPage';
import { OnboardingProvider } from './ui-kit/onboarding/OnboardingProvider';

export function App() {
  return (
    <OnboardingProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<CreateProjectPage />} />
          <Route path="/projects/:id" element={<ProjectDashboardPage />} />
          <Route path="/projects/:id/architecture-rules" element={<ArchitectureRulesPage />} />
          <Route path="/projects/:id/confluence-settings" element={<ConfluenceSettingsPage />} />
          <Route path="/projects/:id/ai-settings" element={<AISettingsPage />} />
          <Route path="/projects/:id/tasks/new" element={<NewTaskPage />} />
          <Route path="/projects/:id/history" element={<HistoryPage />} />
          <Route path="/sessions/:id" element={<AnalysisPage />} />
          <Route path="/sessions/:id/proposal" element={<ProposalPage />} />
          <Route path="/sessions/:id/diff" element={<DiffPage />} />
          <Route path="/sessions/:id/preview" element={<PreviewPage />} />
          <Route path="/sessions/:id/apply" element={<ApplyPage />} />
          <Route path="/help" element={<HelpCenterPage />} />
        </Route>
      </Routes>
    </OnboardingProvider>
  );
}
