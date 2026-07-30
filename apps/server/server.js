const express = require('express');
const cors = require('cors');
require('dotenv').config();
require('./config/db'); // connect DB

const app = express();

app.use(cors());
app.use(express.json());


const pharmacyRoutes = require('./routes/pharmacy_routes');
const labRoutes = require('./routes/lab_routes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const appoint_patient_routes=require('./routes/app_pateint_router');
const userRoutes = require('./routes/userRoutes');

app.use('/api/appoint_patients',appoint_patient_routes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/users', userRoutes);
const patientRoutes = require('./routes/patient_routes');
app.use('/api/patients', patientRoutes);
app.get('/', (req, res) => {
    res.send("🚀 Healvista Backend Running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server started on http://localhost:${PORT}`);
});
