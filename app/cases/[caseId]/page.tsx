import CaseViewerClient from './CaseViewerClient';

export default async function CaseViewerPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseViewerClient caseId={caseId} />;
}
