const sql = require('mssql');

// Create new appointment
const createAppointment = async (req, res) => {
    const { 
        patient_id, 
        doctor_id, 
        appointment_date,
        reason 
    } = req.body;
    
    try {
        const request = new sql.Request();
        request.input('patient_id', sql.Int, patient_id);
        request.input('doctor_id', sql.Int, doctor_id);
        request.input('appointment_date', sql.DateTime, appointment_date);
        request.input('status', sql.VarChar(20), 'Scheduled');
        
        // Create appointment
        const result = await request.query(`
            INSERT INTO Appointments (
                patient_id, doctor_id, appointment_date, status
            )
            OUTPUT INSERTED.appointment_id
            VALUES (
                @patient_id, @doctor_id, @appointment_date, @status
            )
        `);
        
        const appointmentId = result.recordset[0].appointment_id;
        
        // Create feedback record (without rating)
        const feedbackRequest = new sql.Request();
        feedbackRequest.input('patient_id', sql.Int, patient_id);
        feedbackRequest.input('comments', sql.Text, reason || '');
        
        await feedbackRequest.query(`
            INSERT INTO Feedback (
                patient_id,
                comments
            )
            VALUES (
                @patient_id,
                @comments
            )
        `);
        
        res.status(201).json({ 
            message: 'Appointment created successfully',
            appointmentId: appointmentId 
        });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error creating appointment', error: err.message });
    }
};

// Get appointments by doctor ID
const getAppointmentsByDoctor = async (req, res) => {
    const { doctorId } = req.params;
    
    try {
        const request = new sql.Request();
        request.input('doctorId', sql.Int, doctorId);
        
        const result = await request.query(`
            SELECT 
                a.appointment_id,
                p.patient_id,
                p.full_name as patient_name,
                a.appointment_date,
                a.status,
                f.comments
            FROM Appointments a
            JOIN Patients p ON a.patient_id = p.patient_id
            LEFT JOIN Feedback f ON a.patient_id = f.patient_id
            WHERE a.doctor_id = @doctorId
            ORDER BY a.appointment_date DESC
        `);
        
        res.json(result.recordset);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error fetching appointments', error: err.message });
    }
};

// Get appointments by patient ID
const getAppointmentsByPatient = async (req, res) => {
    const { patientId } = req.params;
    
    try {
        const request = new sql.Request();
        request.input('patientId', sql.Int, patientId);
        
        const result = await request.query(`
            SELECT 
                a.appointment_id,
                d.doctor_id,
                u.full_name as doctor_name,
                d.specialization,
                a.appointment_date,
                a.status,
                f.comments
            FROM Appointments a
            JOIN Doctors d ON a.doctor_id = d.doctor_id
            JOIN Users u ON d.user_id = u.user_id
            LEFT JOIN Feedback f ON a.patient_id = f.patient_id
            WHERE a.patient_id = @patientId
            ORDER BY a.appointment_date DESC
        `);
        
        res.json(result.recordset);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error fetching appointments', error: err.message });
    }
};

// Update appointment status
const updateAppointmentStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('status', sql.VarChar(20), status);
        
        await request.query(`
            UPDATE Appointments
            SET status = @status
            WHERE appointment_id = @id
        `);
        
        res.json({ message: 'Appointment status updated successfully' });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error updating appointment', error: err.message });
    }
};

// Submit feedback for appointment
const submitFeedback = async (req, res) => {
    const { patientId } = req.params;
    const { comments } = req.body;
    
    try {
        const request = new sql.Request();
        request.input('patient_id', sql.Int, patientId);
        request.input('comments', sql.Text, comments);
        
        await request.query(`
            UPDATE Feedback
            SET comments = @comments,
                submitted_date = GETDATE()
            WHERE patient_id = @patient_id
        `);
        
        res.json({ message: 'Feedback submitted successfully' });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error submitting feedback', error: err.message });
    }
};

const getTotalAppointmentsCount = async (req, res) => {
  try {
    const result = await sql.query`SELECT COUNT(*) AS total FROM Appointments`;
    res.status(200).json({ total: result.recordset[0].total });
  } catch (err) {
    console.error('Error fetching total appointment count:', err);
    res.status(500).json({ error: 'Failed to fetch appointment count' });
  }
};

const getTotalBillingCount = async (req, res) => {
  try {
    const result = await sql.query`SELECT COUNT(*) AS total FROM Billing`;
    res.status(200).json({ total: result.recordset[0].total });
  } catch (err) {
    console.error('Error fetching total billing count:', err);
    res.status(500).json({ error: 'Failed to fetch billing count' });
  }
};

module.exports = {
    createAppointment,
    getAppointmentsByDoctor,
    getAppointmentsByPatient,
    updateAppointmentStatus,
    submitFeedback,
    getTotalAppointmentsCount,
    getTotalBillingCount
};