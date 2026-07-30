import { Link } from "react-router-dom";
import { HeartPulse, Stethoscope, Calendar, Shield } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <header className="flex items-center justify-between px-8 py-4 bg-white/80 backdrop-blur border-b">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-8 h-8 text-green-600" />
          <span className="text-xl font-bold text-green-800">HealVista</span>
        </div>
        <Link
          to="/login"
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Sign In
        </Link>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold text-green-900 mb-6">Hospital Management, Simplified</h1>
        <p className="text-xl text-green-700 mb-12 max-w-2xl mx-auto">
          HealVista streamlines patient registration, appointments, clinical records, pharmacy, lab
          work, and billing — all in one platform.
        </p>
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {[
            {
              icon: Stethoscope,
              title: "Clinical Core",
              desc: "SOAP notes, prescriptions, lab orders, and referrals in one place",
            },
            {
              icon: Calendar,
              title: "Smart Scheduling",
              desc: "Slot-based appointments with QR check-in and live queue",
            },
            {
              icon: Shield,
              title: "Role-Based Access",
              desc: "7 distinct roles with granular permissions and audit trails",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white p-6 rounded-xl shadow-md text-left">
              <Icon className="w-10 h-10 text-green-500 mb-3" />
              <h3 className="text-lg font-semibold text-green-900 mb-2">{title}</h3>
              <p className="text-gray-600">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
