import { useState } from 'react';

export default function DataTable({ columns, data, loading, emptyMessage }) {
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedData = [...data].sort((a, b) => {
        if (!sortConfig.key) return 0;
        if (a[sortConfig.key] < b[sortConfig.key]) {
            return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
            return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        {columns.map((column) => (
                            <th
                                key={column.accessor}
                                scope="col"
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                onClick={() => requestSort(column.accessor)}
                            >
                                <div className="flex items-center">
                                    {column.header}
                                    {sortConfig.key === column.accessor && (
                                        <span className="ml-1">
                                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                        </span>
                                    )}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {loading ? (
                        <tr>
                            <td colSpan={columns.length} className="px-6 py-4 text-center">
                                <div className="flex justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-600"></div>
                                </div>
                            </td>
                        </tr>
                    ) : sortedData.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} className="px-6 py-4 text-center text-gray-500">
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        sortedData.map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-green-50">
                                {columns.map((column) => (
                                    <td key={`${rowIndex}-${column.accessor}`} className="px-6 py-4 whitespace-nowrap">
                                        {column.cell
                                            ? column.cell(row[column.accessor], row)
                                            : <span className="text-sm text-gray-900">{row[column.accessor]}</span>
                                        }
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}