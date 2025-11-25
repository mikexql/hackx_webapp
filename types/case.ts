export type CaseStatus = 'open' | 'in-progress' | 'closed' | 'archived';
export type CaseMetadata = {
  id: string;
  title: string;
  description: string;
  status: CaseStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
};

export type CaseSummary = {
  id: string;
  title: string;
  description: string;
  status: CaseStatus;
  createdBy?: string;
  updatedAt: string;
  createdAt: string;
  evidenceCount: number;
  tags: string[];
  files: {
    pgm?: string;
    yaml?: string;
    csv?: string;
  };
};

export type CaseDetail = CaseSummary;
