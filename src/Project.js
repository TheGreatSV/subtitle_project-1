// ProjectsPage — list, create, open and delete projects (stored in IndexedDB).
import React, { useState, useEffect, useCallback } from 'react';
import './Project.css';
import './Workspace.css'; // shared tokens (colors, ws-btn, ws-input)
import WsModal from './Modal';
import MobileWarning from './MobileWarning';
import { useNavigate } from 'react-router-dom';
import { useToast } from './Toast';
import { listProjects, createProject, deleteProject } from './lib/storage';

const byModifiedDesc = (a, b) => b.modified - a.modified;

const ProjectsPage = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState('');
  const [nameError, setNameError] = useState('');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [deleteName, setDeleteName] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listProjects();
      setProjects([...list].sort(byModifiedDesc));
    } catch (err) {
      console.error(err);
      toast.error(`Couldn't load your projects: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { refresh(); }, [refresh]);

  const closeProjectModal = () => {
    setShowProjectModal(false);
    setProjectName('');
    setNameError('');
  };

  const openProject = (name) => {
    sessionStorage.setItem('project', name);
    navigate('/Editor');
  };

  const handleAddProject = async () => {
    const trimmed = projectName.trim();
    if (!trimmed) {
      setNameError('Enter a project name.');
      return;
    }
    if (projects.some(p => p.name === trimmed)) {
      setNameError('A project with this name already exists.');
      return;
    }
    try {
      await createProject(trimmed);
      closeProjectModal();
      openProject(trimmed);
    } catch (err) {
      setNameError(err.message);
    }
  };

  const handleDeleteProject = async () => {
    const name = deleteName;
    setDeleteName(null);
    try {
      await deleteProject(name);
      if (sessionStorage.getItem('project') === name) sessionStorage.removeItem('project');
      await refresh();
      toast.success(`Deleted "${name}"`);
    } catch (err) {
      toast.error(`Couldn't delete "${name}": ${err.message}`);
    }
  };

  return (
    <div className="projects-page">
      <MobileWarning />

      <div className="projects-header">
        <div>
          <div className="brand"><span className="bracket">[</span>SRT Creator<span className="bracket">]</span></div>
          <div className="sub">{loading ? 'Loading…' : `${projects.length} project${projects.length === 1 ? '' : 's'}`}</div>
        </div>
        <button className="ws-btn primary" onClick={() => setShowProjectModal(true)}>+ New project</button>
      </div>

      {loading ? null : projects.length === 0 ? (
        <div className="projects-empty">
          <div className="headline">No projects yet</div>
          <div className="subline">Create a project to start timing subtitles.</div>
          <button className="ws-btn primary" onClick={() => setShowProjectModal(true)}>+ New project</button>
        </div>
      ) : (
        <div className="projects-container">
          {projects.map((project) => (
            <div key={project.name} className="project-card">
              <div className="project-placeholder">{project.name.charAt(0).toUpperCase()}</div>
              <div className="card-content">
                <div className="project-name">{project.name}</div>
                <div className="card-meta">Created {project.created.toLocaleDateString()}</div>
                <div className="card-meta">Modified {project.modified.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
                <div className="card-actions">
                  <button className="ws-btn danger" onClick={() => setDeleteName(project.name)}>Delete</button>
                  <button className="ws-btn primary" onClick={() => openProject(project.name)}>Open</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Project Modal */}
      <WsModal show={showProjectModal} onClose={closeProjectModal} title="New project">
        <WsModal.Body>
          <div className="ws-form-group">
            <label>Project name</label>
            <input
              className="ws-input"
              value={projectName}
              onChange={(e) => { setProjectName(e.target.value); setNameError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddProject(); }}
              placeholder="e.g. episode_04"
              autoFocus
            />
            {nameError && <div className="ws-form-error">{nameError}</div>}
          </div>
        </WsModal.Body>
        <WsModal.Footer>
          <button className="ws-btn" onClick={closeProjectModal}>Cancel</button>
          <button className="ws-btn primary" onClick={handleAddProject}>Create project</button>
        </WsModal.Footer>
      </WsModal>

      {/* Delete Project Modal */}
      <WsModal show={deleteName != null} onClose={() => setDeleteName(null)} title="Delete project" tone="danger">
        <WsModal.Body>
          <p>
            Are you sure you want to delete <strong>{deleteName}</strong>? Its cues and saved video will be removed permanently.
          </p>
        </WsModal.Body>
        <WsModal.Footer>
          <button className="ws-btn" onClick={() => setDeleteName(null)}>Cancel</button>
          <button className="ws-btn danger-solid" onClick={handleDeleteProject}>Delete</button>
        </WsModal.Footer>
      </WsModal>
    </div>
  );
};

export default ProjectsPage;
