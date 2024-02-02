import express from 'express';
import {createClient} from '@supabase/supabase-js'
import morgan from 'morgan'
import bodyParser from "body-parser";

const app = express();


// using morgan for logs
app.use(morgan('combined'));

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

const supabaseUrl = 'https://mtoxeeddajuycuryoubv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10b3hlZWRkYWp1eWN1cnlvdWJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDY3NjA4NjcsImV4cCI6MjAyMjMzNjg2N30.FTAIuOANr1vu3qpxi5KFcSW2c_ueXACt8cy8kXgTEpo'; // Place your API key here
const supabase = createClient(supabaseUrl, supabaseKey);

app.get('/statistics', async (req, res) => {
    try {
      const assigned = await supabase
        .from('project_assignments')
        .select('*', { count: 'exact' });
  
      const totalEmployees = await supabase
        .from('employees')
        .select('*', { count: 'exact' });
  
      if (assigned.error) throw assigned.error;
      if (totalEmployees.error) throw totalEmployees.error;
  
      const assignedEmployeesCount = assigned.count;
      const totalEmployeesCount = totalEmployees.count;
      const benchEmployeesCount = totalEmployeesCount - assignedEmployeesCount;
  
      const statistics = {
        assignedEmployeesPercentage: (assignedEmployeesCount / totalEmployeesCount) * 100,
        benchEmployeesPercentage: (benchEmployeesCount / totalEmployeesCount) * 100
      };
  
      res.json(statistics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/projects/details', async (req, res) => {
    try {
      const { data: projects, error } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          description,
          status,
          due_date,
          progress,
          project_assignments!inner(*, employee_id(id, name, profile_image_url))
        `);
  
      if (error) throw error;
  
      res.json(projects.map(project => ({
        id: project.id,
        name: project.name,
        description: project.description,
        dueDate: project.due_date,
        progressPercentage: project.progress,
        team: project.project_assignments.map(assignment => ({
          id: assignment.employee_id.id,
          name: assignment.employee_id.name,
          profileImageUrl: assignment.employee_id.profile_image_url
        }))
      })));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app.get('/employees/project-queue', async (req, res) => {
    try {
      const { data: employees, error } = await supabase
        .from('employees')
        .select(`
          id,
          name,
          profile_image_url,
          next_project_id:projects(id, name, due_date)
        `);
  
      if (error) throw error;
  
      res.json(employees.map(employee => ({
        id: employee.id,
        name: employee.name,
        profileImageUrl: employee.profile_image_url,
        nextProject: {
          name: employee.next_project_id.name,
          dueDate: employee.next_project_id.due_date
        }
      })));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
    
app.post('/projects', async (req, res) => {
    const { name, description, status, due_date, progress } = req.body;
    const { data, error } = await supabase
      .from('projects')
      .insert([
        { name, description, status, due_date, progress }
      ]);
  
    if (error) return res.status(400).send(error);
    res.status(201).send(data);
  });
  

  app.post('/projects/progress', async (req, res) => {
    const { projectId, progress } = req.body;
    const { data, error } = await supabase
      .from('projects')
      .update({ progress })
      .eq('id', projectId);
  
    if (error) return res.status(400).send(error);
    res.status(200).send(data);
  });
  
  app.post('/projects/assign', async (req, res) => {
    const { projectId, employeeIds } = req.body; // employeeIds is an array of employee IDs
    const assignments = employeeIds.map(employeeId => ({
      project_id: projectId,
      employee_id: employeeId
    }));
  
    const { data, error } = await supabase
      .from('project_assignments')
      .insert(assignments);
  
    if (error) return res.status(400).send(error);
    res.status(201).send(data);
  });
  app.post('/employees', async (req, res) => {
    const { name, profile_image_url, current_project_id, next_project_id } = req.body;
    const { data, error } = await supabase
      .from('employees')
      .insert([
        { name, profile_image_url, current_project_id, next_project_id }
      ]);
  
    if (error) return res.status(400).send(error);
    res.status(201).send(data);
  });
    
// Get projects
app.get('/projects', async (req, res) => {
    const { data, error } = await supabase
      .from('projects')
      .select('*');
  
    if (error) return res.status(400).send(error);
    res.send(data);
  });
  app.post('/projects/progress', async (req, res) => {
    const { projectId, progress } = req.body;
  
    try {
      // Update project progress
      const { error: projectUpdateError } = await supabase
        .from('projects')
        .update({ progress })
        .eq('id', projectId);
  
      if (projectUpdateError) throw projectUpdateError;
  
      // If the progress is more than 80%, start allocating new projects
      if (progress > 80) {
        // Get all employees assigned to this project
        const { data: assignedEmployees, error: assignmentError } = await supabase
          .from('project_assignments')
          .select('employee_id')
          .eq('project_id', projectId);
  
        if (assignmentError) throw assignmentError;
  
        // Allocate new projects to all assigned employees
        await Promise.all(assignedEmployees.map(async ({ employee_id }) => {
          await allocateNewProjectToEmployee(employee_id);
        }));
      }
  
      res.status(200).send({ message: 'Project progress updated and new projects allocated where applicable.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  async function allocateNewProjectToEmployee(employeeId) {
    // Logic to assign a new project
    // For example, find the next project that doesn't have enough team members
    // This is a placeholder function; you need to implement the actual logic based on your requirements
    const { data: nextProject, error: nextProjectError } = await supabase
      .from('projects')
      .select('id')
      .neq('status', 'completed')
      .order('due_date', { ascending: true })
      .limit(1)
      .single();
  
    if (nextProjectError) throw nextProjectError;
  
    // Update the employee's next project
    const { error: employeeUpdateError } = await supabase
      .from('employees')
      .update({ next_project_id: nextProject.id })
      .eq('id', employeeId);
  
    if (employeeUpdateError) throw employeeUpdateError;
  }
  
  // Get free employees
  app.get('/employees/free', async (req, res) => {
    // Example logic, adjust according to your schema
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .not('status', 'eq', 'assigned');
  
    if (error) return res.status(400).send(error);
    res.send(data);
  });
  app.post('/employees/allocate', async (req, res) => {
    // Fetch free employees
    const { data: freeEmployees, error: freeEmployeesError } = await supabase
      .from('employees')
      .select('*')
      .not('status', 'eq', 'assigned');
  
    if (freeEmployeesError) return res.status(400).send(freeEmployeesError);
  
    // Fetch upcoming projects
    const { data: upcomingProjects, error: upcomingProjectsError } = await supabase
      .from('projects')
      .select('*')
      .eq('status', 'upcoming');
  
    if (upcomingProjectsError) return res.status(400).send(upcomingProjectsError);
  
    // Example logic to allocate employees to projects
    // This should be adjusted based on your actual requirements and data model
    freeEmployees.forEach(async (employee) => {
      if (upcomingProjects.length > 0) {
        const project = upcomingProjects.shift(); // Assign an employee to the first upcoming project
        await supabase
          .from('project_assignments')
          .insert([{ projectId: project.id, employeeId: employee.id }]);
      }
    });
  
    res.send({ message: 'Employees allocated to projects' });
  });
        


app.get('/', (req, res) => {
    res.send("Hello I am working my friend Supabase <3");
});

app.get('*', (req, res) => {
    res.send("Hello again I am working my friend to the moon and behind <3");
});

app.listen(3000, () => {
    console.log(`> Ready on http://localhost:3000`);
});