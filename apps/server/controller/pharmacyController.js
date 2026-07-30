const sql = require('mssql');

// Get all medicines
const getAllMedicines = async (req, res) => {
    try {
        const request = new sql.Request();
        const result = await request.query(`
            SELECT 
                medicine_id, 
                medicine_name, 
                stock_quantity, 
                expiry_date 
            FROM Pharmacy
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error fetching medicines', error: err.message });
    }
};

// Add new medicine
const addMedicine = async (req, res) => {
    const { medicine_name, stock_quantity, expiry_date } = req.body;
    
    try {
        const request = new sql.Request();
        request.input('medicine_name', sql.VarChar, medicine_name);
        request.input('stock_quantity', sql.Int, stock_quantity);
        request.input('expiry_date', sql.Date, new Date(expiry_date));
        
        await request.query(`
            INSERT INTO Pharmacy (medicine_name, stock_quantity, expiry_date)
            VALUES (@medicine_name, @stock_quantity, @expiry_date)
        `);
        
        res.status(201).json({ message: 'Medicine added successfully' });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error adding medicine', error: err.message });
    }
};

// Update medicine
const updateMedicine = async (req, res) => {
    const { id } = req.params;
    const { medicine_name, stock_quantity, expiry_date } = req.body;
    
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('medicine_name', sql.VarChar, medicine_name);
        request.input('stock_quantity', sql.Int, stock_quantity);
        request.input('expiry_date', sql.Date, new Date(expiry_date));
        
        await request.query(`
            UPDATE Pharmacy
            SET medicine_name = @medicine_name,
                stock_quantity = @stock_quantity,
                expiry_date = @expiry_date
            WHERE medicine_id = @id
        `);
        
        res.json({ message: 'Medicine updated successfully' });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error updating medicine', error: err.message });
    }
};

// Delete medicine
const deleteMedicine = async (req, res) => {
    const { id } = req.params;
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        await request.query('DELETE FROM Pharmacy WHERE medicine_id = @id');
        res.json({ message: 'Medicine deleted successfully' });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Error deleting medicine', error: err.message });
    }
};

const getTotalMedicinesCount = async (req, res) => {
  try {
    const result = await sql.query`SELECT COUNT(*) AS total FROM Pharmacy`;
    res.status(200).json({ total: result.recordset[0].total });
  } catch (err) {
    console.error('Error fetching total medicine count:', err);
    res.status(500).json({ error: 'Failed to fetch medicine count' });
  }
};

module.exports = {
    getAllMedicines,
    addMedicine,
    updateMedicine,
    deleteMedicine,
    getTotalMedicinesCount,
};