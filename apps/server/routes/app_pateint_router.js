const express = require('express');
const {
    getAllPatients,
    searchPatients,
    getPatientById,
    createPatient
} = require('../controller/app_patient_controller');

const router = express.Router();

router.get('/', getAllPatients);
router.get('/search', searchPatients);
router.get('/:id', getPatientById);
router.post('/', createPatient);

module.exports = router;