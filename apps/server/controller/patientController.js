const sql = require('mssql');


// Get total number of patients
exports.getTotalPatientsCount = async (req, res) => {
    try {
        const result = await sql.query`SELECT COUNT(*) AS total FROM Patients`;
        res.status(200).json({ total: result.recordset[0].total });
    } catch (err) {
        console.error("Error fetching total patient count:", err);
        res.status(500).json({ error: 'Failed to fetch patient count' });
    }
};

// Get patients admitted today
exports.getTodayAdmittedPatients = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
        const result = await sql.query`
      SELECT COUNT(*) AS admittedToday 
      FROM patients 
      WHERE CONVERT(date, registration_date) = ${today}
    `;
        res.json({ admittedToday: result.recordset[0].admittedToday });
    } catch (err) {
        console.error('Error fetching today\'s admitted patients:', err.message);
        res.status(500).json({ error: err.message });
    }
};
// Get number of critical patients
exports.getCriticalPatientsCount = async (req, res) => {
    try {
        const result = await sql.query`
      SELECT COUNT(*) AS criticalCount 
      FROM patients 
      WHERE status = 'Critical'
    `;
        res.json({ criticalCount: result.recordset[0].criticalCount });
    } catch (err) {
        console.error('Error fetching critical patients count:', err.message);
        res.status(500).json({ error: err.message });
    }
};
// Get all patients
exports.getAllPatients = async (req, res) => {
    try {
        const result = await sql.query`
            SELECT
                patient_id,
                full_name,
                CONVERT(date, date_of_birth) AS date_of_birth,
                gender,
                CONVERT(date, registration_date) AS admissionDate,
                status,
                diagnosis,
                room
            FROM Patients;
        `;

        // Format date fields in JavaScript
        const formattedPatients = result.recordset.map(patient => ({
            ...patient,
            date_of_birth: patient.date_of_birth?.toISOString().split('T')[0],
            admissionDate: patient.admissionDate?.toISOString().split('T')[0]
        }));

        res.status(200).json(formattedPatients);
    } catch (err) {
        console.error('Error fetching patients:', err.message);
        res.status(500).json({ error: 'Failed to fetch patients' });
    }
};

