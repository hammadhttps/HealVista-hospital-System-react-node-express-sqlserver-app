const sql = require('mssql');

// Get all lab tests
const getAllTests = async (req, res) => {
    try {
        const request = new sql.Request();
        const result = await request.query(`
            SELECT 
                t.test_id,
                p.patient_id,
                p.full_name AS patientName,
                p.date_of_birth,
                p.gender,
                p.contact_info,
                p.registration_date,
                t.test_name,
                t.result,
                t.test_date
            FROM LabTests t
            JOIN Patients p ON t.patient_id = p.patient_id
        `);
        
        res.json(result.recordset);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error fetching lab tests', error: err.message });
    }
};

// Get test by ID
const getTestById = async (req, res) => {
    const { id } = req.params;
    
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        
        const result = await request.query(`
            SELECT 
                t.test_id,
                p.patient_id,
                p.full_name AS patientName,
                p.date_of_birth,
                p.gender,
                p.contact_info,
                p.registration_date,
                t.test_name,
                t.result,
                t.test_date
            FROM LabTests t
            JOIN Patients p ON t.patient_id = p.patient_id
            WHERE t.test_id = @id
        `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Test not found' });
        }
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error fetching test details', error: err.message });
    }
};

// Create new test
const createTest = async (req, res) => {
    const { 
        patient_id, 
        test_name, 
        result = null
    } = req.body;
    
    try {
        const request = new sql.Request();
        request.input('patient_id', sql.Int, patient_id);
        request.input('test_name', sql.VarChar(100), test_name);
        request.input('result', sql.Text, result);
        
        const testResult = await request.query(`
            INSERT INTO LabTests (
                patient_id, test_name, result, test_date
            )
            OUTPUT INSERTED.test_id
            VALUES (
                @patient_id, @test_name, @result, GETDATE()
            )
        `);
        
        const testId = testResult.recordset[0].test_id;
        
        res.status(201).json({ 
            message: 'Lab test created successfully',
            testId: testId 
        });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error creating lab test', error: err.message });
    }
};

// Update test
const updateTest = async (req, res) => {
    const { id } = req.params;
    const { 
        test_name, 
        result
    } = req.body;
    
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('test_name', sql.VarChar(100), test_name);
        request.input('result', sql.Text, result);
        
        await request.query(`
            UPDATE LabTests
            SET test_name = @test_name,
                result = @result
            WHERE test_id = @id
        `);
        
        res.json({ message: 'Lab test updated successfully' });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error updating lab test', error: err.message });
    }
};

// Delete test
const deleteTest = async (req, res) => {
    const { id } = req.params;
    
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        
        await request.query(`
            DELETE FROM LabTests
            WHERE test_id = @id
        `);
        
        res.json({ message: 'Lab test deleted successfully' });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error deleting lab test', error: err.message });
    }
};

// Get tests by status (Note: status field removed in simplified schema)
const getTestsByStatus = async (req, res) => {
    res.status(501).json({ message: 'Status filtering not implemented in simplified schema' });
};

// Get tests by patient ID
const getTestsByPatient = async (req, res) => {
    const { patientId } = req.params;
    
    try {
        const request = new sql.Request();
        request.input('patientId', sql.Int, patientId);
        
        const result = await request.query(`
            SELECT 
                t.test_id,
                t.test_name,
                t.result,
                t.test_date
            FROM LabTests t
            WHERE t.patient_id = @patientId
        `);
        
        res.json(result.recordset);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error fetching patient lab tests', error: err.message });
    }
};

const getTotalLabTestsCount = async (req, res) => {
  try {
    const result = await sql.query`SELECT COUNT(*) AS total FROM LabTests`;
    res.status(200).json({ total: result.recordset[0].total });
  } catch (err) {
    console.error('Error fetching total lab tests count:', err);
    res.status(500).json({ error: 'Failed to fetch lab tests count' });
  }
};

module.exports = {
    getAllTests,
    getTestById,
    createTest,
    updateTest,
    deleteTest,
    getTestsByStatus,
    getTestsByPatient,
    getTotalLabTestsCount
};