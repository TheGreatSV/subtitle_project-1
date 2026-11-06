import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectsPage from './Project';
import { ToastProvider } from './Toast';

test('projects page renders the empty state', async () => {
  localStorage.clear();
  render(
    <ToastProvider>
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    </ToastProvider>
  );
  expect(await screen.findByText(/No projects yet/i)).toBeInTheDocument();
});
