const sql = require('mssql');

// Get all doctors
const getAllDoctors = async (req, res) => {
    try {
        const request = new sql.Request();
        const result = await request.query(`
            SELECT 
                d.doctor_id,
                u.full_name,
                u.email,
                u.phone,
                d.specialization,
                d.availability_schedule,
                d.feedback_score
            FROM Doctors d
            JOIN Users u ON d.user_id = u.user_id
        `);
        
        res.json(result.recordset);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error fetching doctors', error: err.message });
    }
};

// Get doctor by ID
const getDoctorById = async (req, res) => {
    const { id } = req.params;
    
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        
        const doctorResult = await request.query(`
            SELECT 
                d.doctor_id,
                u.full_name,
                u.email,
                u.phone,
                d.specialization,
                d.availability_schedule,
                d.feedback_score
            FROM Doctors d
            JOIN Users u ON d.user_id = u.user_id
            WHERE d.doctor_id = @id
        `);
        
        if (doctorResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Doctor not found' });
        }

        const reviewsResult = await request.query(`
            SELECT 
                f.feedback_id,
                p.full_name as patient_name,
                f.comments,
                f.submitted_date,
                f.rating
            FROM Feedback f
            JOIN Appointments a ON f.appointment_id = a.appointment_id
            JOIN Patients p ON a.patient_id = p.patient_id
            WHERE a.doctor_id = @id
            ORDER BY f.submitted_date DESC
        `);

        const doctor = doctorResult.recordset[0];
        doctor.reviews = reviewsResult.recordset;
        
        res.json(doctor);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error fetching doctor details', error: err.message });
    }
};

// Get doctor availability
const getDoctorAvailability = async (req, res) => {
    const { id } = req.params;
    
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        
        const result = await request.query(`
            SELECT availability_schedule
            FROM Doctors
            WHERE doctor_id = @id
        `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Doctor not found' });
        }
        
        res.json(result.recordset[0].availability_schedule);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error fetching doctor availability', error: err.message });
    }
};

const getTotalDoctorsCount = async (req, res) => {
  try {
    const result = await sql.query`SELECT COUNT(*) AS total FROM Doctors`;
    res.status(200).json({ total: result.recordset[0].total });
  } catch (err) {
    console.error('Error fetching total doctor count:', err);
    res.status(500).json({ error: 'Failed to fetch doctor count' });
  }
};

module.exports = {
    getAllDoctors,
    getDoctorById,
    getDoctorAvailability,
    getTotalDoctorsCount,
};