import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import PrintCommentView from './components/PrintCommentView';

const PrintPreviewPage: React.FC = () => {
  const { user } = useAuth();

  const isAdmin = user?.is_superuser || user?.is_staff || false;
  const authorName = user
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username
    : 'Ismeretlen';

  return <PrintCommentView isAdmin={isAdmin} authorName={authorName} />;
};

export default PrintPreviewPage;
