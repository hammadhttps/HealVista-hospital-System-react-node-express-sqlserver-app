export default function StatusBadge({ status }) {
    // Define status styles
    const statusStyles = {
        pending: {
            bg: 'bg-yellow-100',
            text: 'text-yellow-800',
            border: 'border-yellow-200'
        },
        completed: {
            bg: 'bg-green-100',
            text: 'text-green-800',
            border: 'border-green-200'
        },
        confirmed: {
            bg: 'bg-blue-100',
            text: 'text-blue-800',
            border: 'border-blue-200'
        },
        cancelled: {
            bg: 'bg-red-100',
            text: 'text-red-800',
            border: 'border-red-200'
        },
        critical: {
            bg: 'bg-red-100',
            text: 'text-red-800',
            border: 'border-red-200'
        },
        active: {
            bg: 'bg-green-100',
            text: 'text-green-800',
            border: 'border-green-200'
        },
        inactive: {
            bg: 'bg-gray-100',
            text: 'text-gray-800',
            border: 'border-gray-200'
        },
        default: {
            bg: 'bg-gray-100',
            text: 'text-gray-800',
            border: 'border-gray-200'
        }
    };

    // Get styles for the current status or use default
    const currentStatus = statusStyles[status.toLowerCase()] || statusStyles.default;

    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
        ${currentStatus.bg} ${currentStatus.text} ${currentStatus.border} border`}
        >
            {/* Status icon based on status */}
            {status.toLowerCase() === 'pending' && (
                <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-yellow-500" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                </svg>
            )}
            {status.toLowerCase() === 'completed' && (
                <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-green-500" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                </svg>
            )}
            {status.toLowerCase() === 'confirmed' && (
                <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-blue-500" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                </svg>
            )}
            {status.toLowerCase() === 'cancelled' && (
                <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-red-500" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                </svg>
            )}
            {status.toLowerCase() === 'critical' && (
                <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-red-500" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                </svg>
            )}

            {/* Status text with capitalization */}
            {status.toLowerCase().charAt(0).toUpperCase() + status.toLowerCase().slice(1)}
        </span>
    );
}