// ProjectsPage.js
import React, { useState, useEffect } from 'react';
import { Button, Card, Modal, Form } from 'react-bootstrap';
import './Project.css'
import { useNavigate } from 'react-router-dom';



const ProjectsPage = () => {
    const navigate = useNavigate(); // Create a history instance

  const [projects, setProjects] = useState([]);
  const [projectName, setProjectName] = useState('');
  const [selectedProjectIndex, setSelectedProjectIndex] = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(null);


  useEffect(() => {
    const savedProjects = localStorage.getItem('Projects');
    if (savedProjects) {
      const parsedProjects = JSON.parse(savedProjects).map(project => ({
        ...project,
        created: new Date(project.created),
        modified: new Date(project.modified)
      }));
      setProjects(parsedProjects);
    }
  }, []);
  useEffect(() => {
    if (projects.length > 0) {

    localStorage.setItem('Projects', JSON.stringify(projects));
    console.log("data:"+ projects)
    }
  }, [projects]);

  const handleAddProject = () => {
    const newProject = {
      name: projectName,
      created: new Date(),
      modified: new Date(),
    };

    if (!projects.some(project => project.name === newProject.name)) 
    { 
    setProjects([...projects, newProject]);
    setProjectName('');
    setShowProjectModal(false);
    }else{
        alert('Project with this name already exists');
    }
  };

  const handleDeleteProject = () => {
    const deleteName=projects[deleteIndex].name;
    localStorage.removeItem(`${deleteName}Entries`);
    localStorage.removeItem(`${deleteName}Divs`);
    setProjects(projects.filter((_, index) => index !== deleteIndex));
    setShowDeleteModal(false);
  };

  const openProjectModal = (index) => {
    setSelectedProjectIndex(index);
    setShowProjectModal(true);
  };

  const openDeleteModal = (index) => {
    setDeleteIndex(index);
    setShowDeleteModal(true);
  };

  const openProject = (index) => {
    // Navigate to the main app page
    // Store data in sessionStorage
   sessionStorage.setItem('project', projects[index].name);

    navigate('/Editor');
  };

  return (
    <div className="projects-page">
      <Button variant="primary" onClick={() => setShowProjectModal(true)}>Add Project</Button>
      
      <div className="projects-container">
        {projects.map((project, index) => (
          <Card key={index} className="project-card">
            <div className="project-placeholder">
              {project.name.charAt(0)}
            </div>
            <div className="card-content">
              <Card.Title>{project.name}</Card.Title>
              <Card.Subtitle className="mb-2 text-muted">Created: {project.created.toLocaleDateString()}</Card.Subtitle>
              <Card.Subtitle className="mb-2 text-muted" >Modified: {project.modified.toLocaleDateString()}</Card.Subtitle>
             <br></br>
              <Button variant="danger" onClick={() => openDeleteModal(index)}>Delete</Button>

              <Button variant="primary" onClick={() => openProject(index)} style={{marginLeft:12}}>Open</Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Add Project Modal */}
      <Modal show={showProjectModal} onHide={() => setShowProjectModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{selectedProjectIndex !== null ? 'Edit Project' : 'Add Project'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group controlId="projectName">
              <Form.Label>Project Name</Form.Label>
              <Form.Control
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowProjectModal(false)}>Close</Button>
          <Button variant="primary" onClick={handleAddProject}>Save Project</Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Project Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>Are you sure you want to delete this project?</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteProject}>Delete</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ProjectsPage;
