export default function Table({ columns, data }) {
    return (
        <div className="overflow-x-auto rounded-lg shadow">
            <table className="min-w-full bg-white">
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <th key={col.accessor} className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase bg-gray-50">
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} className="text-center py-4 text-gray-400">No data</td>
                        </tr>
                    ) : (
                        data.map((row, i) => (
                            <tr key={i} className="border-b hover:bg-blue-50">
                                {columns.map((col) => (
                                    <td key={col.accessor} className="px-4 py-2 text-sm text-gray-700">
                                        {row[col.accessor]}
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