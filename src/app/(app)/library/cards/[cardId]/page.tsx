import { CardDetail } from "@/features/library/card-detail";

export const metadata = { title: "Card" };

export default async function Page({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  return <CardDetail cardId={cardId} />;
}
