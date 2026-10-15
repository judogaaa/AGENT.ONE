import StatusBadge from '../ui/StatusBadge';
import { STATUS_LABEL_MAP } from '../../utils/aiManager';

const VARIANT_MAP = {
  open:            'neutral',
  waiting_client:  'neutral',
  waiting_seller:  'warning',
  lead_created:    'success',
  taken_over:      'dark',
  closed:          'muted',
};

export default function AIManagerStatusBadge({ status, children }) {
  const variant = VARIANT_MAP[status] || 'neutral';
  return (
    <StatusBadge variant={variant} size="sm">
      {children || STATUS_LABEL_MAP[status] || status}
    </StatusBadge>
  );
}
