const express = require('express');
const {
  getAllTests,
  getTestById,
  createTest,
  updateTest,
  deleteTest,
  getTestsByStatus,
  getTestsByPatient,
  getTotalLabTestsCount
} = require('../controller/labController');

const router = express.Router();

router.get('/', getAllTests);                          // GET all tests
router.get('/:id', getTestById);                       // GET test by ID
router.post('/', createTest);                          // CREATE a new test
router.put('/:id', updateTest);                        // UPDATE a test
router.delete('/:id', deleteTest);                     // DELETE a test
router.get('/status/:status', getTestsByStatus);       // GET tests by status
router.get('/patient/:patientId', getTestsByPatient);  // GET tests by patient ID
router.get('/stats/total', getTotalLabTestsCount);

module.exports = router;