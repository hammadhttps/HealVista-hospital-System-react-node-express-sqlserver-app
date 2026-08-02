import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useIncomingReferrals, useOutgoingReferrals } from "../hooks/queries/useClinical";
import ReferralCard, { type ReferralRow } from "../components/referrals/ReferralCard";
import { EmptyState } from "../components/primitives/EmptyState";
import { CardSkeleton } from "../components/primitives/Skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";

export default function Referrals() {
  const { t } = useTranslation(["nav", "referrals"]);
  const [tab, setTab] = useState("incoming");
  const { data: incoming, isLoading: loadingIn } = useIncomingReferrals();
  const { data: outgoing, isLoading: loadingOut } = useOutgoingReferrals();

  const listIn = (incoming ?? []) as ReferralRow[];
  const listOut = (outgoing ?? []) as ReferralRow[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("nav:referrals")}</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="incoming">
            {t("referrals:incoming")}
            {loadingIn ? "" : ` (${listIn.length})`}
          </TabsTrigger>
          <TabsTrigger value="outgoing">
            {t("referrals:outgoing")}
            {loadingOut ? "" : ` (${listOut.length})`}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="incoming" className="pt-4">
          {loadingIn ? (
            <CardSkeleton />
          ) : listIn.length === 0 ? (
            <EmptyState title={t("referrals:noIncoming")} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {listIn.map((r) => (
                <ReferralCard key={r.id} referral={r} actions="incoming" />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="outgoing" className="pt-4">
          {loadingOut ? (
            <CardSkeleton />
          ) : listOut.length === 0 ? (
            <EmptyState title={t("referrals:noOutgoing")} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {listOut.map((r) => (
                <ReferralCard key={r.id} referral={r} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
