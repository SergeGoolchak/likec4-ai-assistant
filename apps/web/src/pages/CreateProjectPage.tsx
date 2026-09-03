import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ApiError, createProject } from '../api/client';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';

export function CreateProjectPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [localRepositoryPath, setLocalRepositoryPath] = useState('');

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => navigate(`/projects/${project.id}`),
  });

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-slate-900">Новый проект</h1>
      <Card className="mt-6">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ name, description: description || undefined, localRepositoryPath });
          }}
        >
          <Field label="Название" value={name} onChange={setName} required placeholder="Например, Payments Platform" />
          <Field label="Описание" value={description} onChange={setDescription} placeholder="Необязательно" />
          <Field
            label="Локальная папка с LikeC4-проектом"
            value={localRepositoryPath}
            onChange={setLocalRepositoryPath}
            required
            placeholder="/Users/you/projects/architecture"
          />

          {mutation.error instanceof ApiError && <ErrorState error={mutation.error.error} />}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Создаём…' : 'Создать проект'}
          </button>
        </form>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
      />
    </label>
  );
}
