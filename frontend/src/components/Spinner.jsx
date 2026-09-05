import React from 'react';

/** The brand loading spinner. Shared so a size/brand change is one edit, not 26. */
export const Spinner = ({ className = 'h-8 w-8' }) => (
  <div className={`animate-spin rounded-full border-b-2 border-brand-primary ${className}`} />
);

/** Spinner centred in a 16rem-tall block — the app's standard section-loading state. */
export const CenteredSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <Spinner />
  </div>
);
