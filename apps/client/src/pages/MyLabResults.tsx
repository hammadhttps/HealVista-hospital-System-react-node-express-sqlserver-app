import LabOrdersPanel from "../components/lab/LabOrdersPanel";

/**
 * Patient's own lab results. The panel runs in "mine" mode, so a guardian acting
 * for a dependant sees that dependant's results, and the server only ever releases
 * values once an order is VERIFIED.
 */
export default function MyLabResults() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Lab Results</h1>
      <LabOrdersPanel mine />
    </div>
  );
}
