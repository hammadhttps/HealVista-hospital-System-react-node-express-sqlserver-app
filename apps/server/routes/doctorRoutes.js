const express = require('express');
const { getAllDoctors, getDoctorById, getDoctorAvailability, getTotalDoctorsCount } = require('../controller/doctorController');
const router = express.Router();

router.get('/', getAllDoctors);                   // GET all doctors
router.get('/:id', getDoctorById);                // GET doctor by ID
router.get('/:id/availability', getDoctorAvailability); // GET doctor availability
router.get('/stats/total', getTotalDoctorsCount);

module.exports = router;