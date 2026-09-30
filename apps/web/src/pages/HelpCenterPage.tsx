import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { marked } from 'marked';
import { Card } from '../components/Card';
import { HELP_TOPICS } from '../ui-kit/help/content';
import { useOnboarding } from '../ui-kit/onboarding/OnboardingProvider';
import gettingStarted from '../../../../docs/user-guide/getting-started.md?raw';
import pipelineAndAnalysis from '../../../../docs/user-guide/pipeline-and-analysis.md?raw';
import proposalReview from '../../../../docs/user-guide/proposal-review.md?raw';
import diffPreviewApply from '../../../../docs/user-guide/diff-preview-apply.md?raw';
import troubleshooting from '../../../../docs/user-guide/troubleshooting.md?raw';

const GUIDES = [gettingStarted, pipelineAndAnalysis, proposalReview, diffPreviewApply, troubleshooting];

/**
 * Рендерит и структурный реестр (HELP_TOPICS — быстрый список label/
 * inlineDescription/contextHelp), и полную markdown-документацию из
 * docs/user-guide/ — план требует и то, и другое на одном экране. Markdown —
 * полностью наш собственный, статический, авторский контент из репозитория
 * (не пользовательский ввод и не вывод LLM), поэтому dangerouslySetInnerHTML
 * здесь безопасен без дополнительной санитизации.
 */
export function HelpCenterPage() {
  const location = useLocation();
  const { restart } = useOnboarding();
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [location.hash]);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Help Center</h1>
        <button
          type="button"
          onClick={restart}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Показать введение снова
        </button>
      </div>

      <h2 className="mt-6 text-lg font-medium text-slate-900">Темы</h2>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {HELP_TOPICS.map((topic) => (
          <Card key={topic.id} className="cursor-pointer py-3" >
            <button type="button" onClick={() => setExpandedTopicId((id) => (id === topic.id ? null : topic.id))} className="w-full text-left">
              <p className="text-sm font-medium text-slate-900">{topic.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{topic.inlineDescription}</p>
              {expandedTopicId === topic.id && <p className="mt-2 text-xs text-slate-600">{topic.contextHelp}</p>}
            </button>
          </Card>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-medium text-slate-900">Документация</h2>
      <Card className="mt-3 space-y-8">
        {GUIDES.map((markdown, index) => (
          <div key={index} className="prose prose-sm prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: marked.parse(markdown) as string }} />
        ))}
      </Card>
    </div>
  );
}
