const sql = require('mssql');

// Get all patients
//making change for purpose of testing of SonarQube
const getAllPatients = async (req, res) => {
    try {
        const request = new sql.Request();
        const result = await request.query(`
            SELECT 
                patient_id,
                full_name,
                date_of_birth,
                gender,
                contact_info,
                registration_date
            FROM Patients
            ORDER BY full_name
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error fetching patients', error: err.message });
    }
};

// Search patients by name
const searchPatients = async (req, res) => {
    const { name } = req.query;
    
    try {
        const request = new sql.Request();
        request.input('name', sql.VarChar(100), `%${name}%`);
        
        const result = await request.query(`
            SELECT 
                patient_id,
                full_name,
                date_of_birth,
                gender,
                contact_info
            FROM Patients
            WHERE full_name LIKE @name
            ORDER BY full_name
        `);
        
        res.json(result.recordset);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error searching patients', error: err.message });
    }
};

// Get patient by ID
const getPatientById = async (req, res) => {
    const { id } = req.params;
    
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        
        const result = await request.query(`
            SELECT 
                patient_id,
                full_name,
                date_of_birth,
                gender,
                contact_info
            FROM Patients
            WHERE patient_id = @id
        `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Patient not found' });
        }
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error fetching patient', error: err.message });
    }
};

// Create new patient
const createPatient = async (req, res) => {
    const { full_name, date_of_birth, gender, contact_info } = req.body;
    
    try {
        const request = new sql.Request();
        request.input('full_name', sql.VarChar(100), full_name);
        request.input('date_of_birth', sql.Date, date_of_birth);
        request.input('gender', sql.VarChar(10), gender);
        request.input('contact_info', sql.VarChar(255), contact_info);
        
        const result = await request.query(`
            INSERT INTO Patients (full_name, date_of_birth, gender, contact_info)
            OUTPUT INSERTED.patient_id
            VALUES (@full_name, @date_of_birth, @gender, @contact_info)
        `);
        
        res.status(201).json({ 
            patient_id: result.recordset[0].patient_id,
            message: 'Patient created successfully'
        });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error creating patient', error: err.message });
    }
};

module.exports = {
    getAllPatients,
    searchPatients,
    getPatientById,
    createPatient
};
