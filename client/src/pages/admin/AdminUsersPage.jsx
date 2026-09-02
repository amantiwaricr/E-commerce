import { useCallback, useEffect, useState } from 'react';
import api from '../../api/client';
import Loader from '../../components/Loader';
import Pagination from '../../components/Pagination';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../context/ToastContext';
import { formatDay } from '../../utils/format';

export default function AdminUsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [filters, setFilters] = useState({ page: 1, role: '', search: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = Object.fromEntries(Object.entries({ ...filters, limit: 20 }).filter(([, v]) => v !== ''));
      const { data } = await api.get('/admin/users', { params });
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleBlock = async (user) => {
    try {
      await api.patch(`/admin/users/${user._id}/block`, { isBlocked: !user.isBlocked });
      toast.success(`${user.name} ${user.isBlocked ? 'unblocked' : 'blocked'}.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Customers</h1>
        <span className="muted small">{pagination.total ?? 0} accounts</span>
      </div>

      <div className="filter-bar">
        <div className="field">
          <label htmlFor="role">Role</label>
          <select id="role" value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value, page: 1 }))}>
            <option value="">All</option>
            <option value="customer">Customers</option>
            <option value="admin">Admins</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="search">Search</label>
          <input
            id="search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
            placeholder="Name or email"
          />
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <Loader />
      ) : users.length === 0 ? (
        <EmptyState title="No customers found" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id}>
                    <td>
                      <strong>{user.name}</strong>
                    </td>
                    <td className="small">{user.email}</td>
                    <td className="small">{user.phone || '—'}</td>
                    <td>
                      <span className={`badge ${user.role === 'admin' ? 'brand' : ''}`}>{user.role}</span>
                    </td>
                    <td className="small muted">{formatDay(user.createdAt)}</td>
                    <td>
                      <span className={`badge ${user.isBlocked ? 'danger' : 'ok'}`}>
                        {user.isBlocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td>
                      {user.role !== 'admin' && (
                        <button
                          type="button"
                          className={`btn sm ${user.isBlocked ? 'secondary' : 'danger'}`}
                          onClick={() => toggleBlock(user)}
                        >
                          {user.isBlocked ? 'Unblock' : 'Block'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            onChange={(page) => setFilters((f) => ({ ...f, page }))}
          />
        </>
      )}
    </>
  );
}
