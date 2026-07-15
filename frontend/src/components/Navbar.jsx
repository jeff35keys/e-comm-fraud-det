import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { items } = useCart();
  const { user, signOut } = useAuth();
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid #eee' }}>
      <Link to="/" style={{ fontWeight: 800, fontSize: 18, textDecoration: 'none', color: '#111' }}>SDU Store</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 14 }}>
        <Link to="/cart" style={{ color: '#111', textDecoration: 'none' }}>Cart ({count})</Link>
        {user ? (
          <>
            <Link to="/orders" style={{ color: '#111', textDecoration: 'none' }}>My Orders</Link>
            <button onClick={signOut} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>Sign Out</button>
          </>
        ) : (
          <Link to="/login" style={{ color: '#111', textDecoration: 'none' }}>Sign In</Link>
        )}
      </div>
    </nav>
  );
}
