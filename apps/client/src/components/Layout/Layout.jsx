import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout({ children }) {
    return (
        <div className="min-h-screen flex bg-gray-100">
            <Sidebar />
            <div className="flex-1 flex flex-col">
                <Header />
                <main className="flex-1 p-6 overflow-y-auto">{children}</main>
            </div>
        </div>
    );
} 