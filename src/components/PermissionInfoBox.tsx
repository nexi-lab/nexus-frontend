import { Info } from 'lucide-react';

interface PermissionInfoBoxProps {
  variant: 'inherit-no-key' | 'inherit-with-key' | 'key-no-inherit';
  title: string;
  description: string;
}

const variantStyles = {
  'inherit-no-key': {
    bg: 'bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-200 dark:border-blue-800',
    icon: 'text-blue-600 dark:text-blue-400',
    title: 'text-blue-900 dark:text-blue-100',
    desc: 'text-blue-800 dark:text-blue-200',
  },
  'inherit-with-key': {
    bg: 'bg-green-50 dark:bg-green-950',
    border: 'border-green-200 dark:border-green-800',
    icon: 'text-green-600 dark:text-green-400',
    title: 'text-green-900 dark:text-green-100',
    desc: 'text-green-800 dark:text-green-200',
  },
  'key-no-inherit': {
    bg: 'bg-orange-50 dark:bg-orange-950',
    border: 'border-orange-200 dark:border-orange-800',
    icon: 'text-orange-600 dark:text-orange-400',
    title: 'text-orange-900 dark:text-orange-100',
    desc: 'text-orange-800 dark:text-orange-200',
  },
};

export function PermissionInfoBox({ variant, title, description }: PermissionInfoBoxProps) {
  const styles = variantStyles[variant];

  return (
    <div className={`${styles.bg} border ${styles.border} rounded-md p-2 text-xs mt-2 mb-2`}>
      <div className="flex items-start gap-2">
        <Info className={`h-3 w-3 ${styles.icon} mt-0.5 flex-shrink-0`} />
        <div>
          <div className={`font-medium ${styles.title}`}>{title}</div>
          <div className={`${styles.desc} mt-0.5`}>{description}</div>
        </div>
      </div>
    </div>
  );
}
