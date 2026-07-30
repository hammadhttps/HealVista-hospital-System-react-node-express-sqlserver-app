/**
 * @typedef {Object} StatCardProps
 * @property {React.ElementType} icon
 * @property {string} title
 * @property {string|number} value
 * @property {'green'|'blue'|'red'|'yellow'|'purple'|'indigo'|'pink'|'teal'|'orange'} [color]
 * @property {boolean} [loading]
 */

const colorClasses = {
    bg: {
        green: 'bg-green-100',
        blue: 'bg-blue-100',
        red: 'bg-red-100',
        yellow: 'bg-yellow-100',
        purple: 'bg-purple-100',
        indigo: 'bg-indigo-100',
        pink: 'bg-pink-100',
        teal: 'bg-teal-100',
        orange: 'bg-orange-100',
    },
    text: {
        green: 'text-green-600',
        blue: 'text-blue-600',
        red: 'text-red-600',
        yellow: 'text-yellow-600',
        purple: 'text-purple-600',
        indigo: 'text-indigo-600',
        pink: 'text-pink-600',
        teal: 'text-teal-600',
        orange: 'text-orange-600',
    },
    border: {
        green: 'border-green-200',
        blue: 'border-blue-200',
        red: 'border-red-200',
        yellow: 'border-yellow-200',
        purple: 'border-purple-200',
        indigo: 'border-indigo-200',
        pink: 'border-pink-200',
        teal: 'border-teal-200',
        orange: 'border-orange-200',
    }
};

export default function StatCard({
    icon: Icon,
    title,
    value,
    color = 'green',
    loading = false
}) {
    return (
        <div className={`bg-white rounded-lg shadow-sm p-4 border ${colorClasses.border[color]}`}>
            <div className="flex items-center justify-between">
                <div className={`w-12 h-12 rounded-full ${colorClasses.bg[color]} flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${colorClasses.text[color]}`} />
                </div>
                <div className="text-right">
                    <p className="text-sm text-gray-500">{title}</p>
                    <p className="text-2xl font-bold text-gray-800">
                        {loading ? (
                            <span className="inline-block h-6 w-8 bg-gray-200 rounded animate-pulse"></span>
                        ) : (
                            value
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
}