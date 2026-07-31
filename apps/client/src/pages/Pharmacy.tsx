import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import StockTable from "../components/pharmacy/StockTable";
import DispenseQueue from "../components/pharmacy/DispenseQueue";
import RecallTool from "../components/pharmacy/RecallTool";
import { useDispenseQueue, useLowStock } from "../hooks/queries/useLabAndPharmacy";
import { Badge } from "../components/ui/badge";

/**
 * Pharmacy console — inventory, the dispensing queue, and batch recall. One screen
 * for the pharmacist's three daily surfaces, with live badges on the queue count
 * and the low-stock count so nothing waits for a page reload to be noticed.
 */
export default function Pharmacy() {
  const { data: queue } = useDispenseQueue();
  const { data: lowStock } = useLowStock();

  const queueCount = Array.isArray(queue) ? queue.length : 0;
  const lowStockCount = Array.isArray(lowStock) ? lowStock.length : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Pharmacy</h1>
      </div>

      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="queue">
            Dispense Queue
            {queueCount > 0 && (
              <Badge className="ml-1.5" variant="warning">
                {queueCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="recall">
            Batch Recall
            {lowStockCount > 0 && (
              <Badge className="ml-1.5" variant="warning">
                {lowStockCount} low
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="pt-4">
          <StockTable />
        </TabsContent>
        <TabsContent value="queue" className="pt-4">
          <DispenseQueue />
        </TabsContent>
        <TabsContent value="recall" className="pt-4">
          <RecallTool />
        </TabsContent>
      </Tabs>
    </div>
  );
}
