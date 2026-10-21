import { CaseInvestigation } from '../../../../features/warehouse/case-investigation';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseInvestigation id={id} />;
}
