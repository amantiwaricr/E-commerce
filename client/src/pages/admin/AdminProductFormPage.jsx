import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/client';
import Loader from '../../components/Loader';
import { useToast } from '../../context/ToastContext';
import { CATEGORIES } from '../../config';

const UNITS = ['kg', 'g', 'piece', 'pack'];

const BLANK = {
  name: '',
  description: '',
  category: CATEGORIES[0],
  price: '',
  unit: 'kg',
  stock: '',
  images: [],
  tags: [],
  isAvailable: true,
};

export default function AdminProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const fileInput = useRef(null);

  const isEdit = Boolean(id);
  const [form, setForm] = useState(BLANK);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/admin/products/${id}`)
      .then(({ data }) =>
        setForm({
          name: data.product.name,
          description: data.product.description,
          category: data.product.category,
          price: data.product.price,
          unit: data.product.unit,
          stock: data.product.stock,
          images: data.product.images || [],
          tags: data.product.tags || [],
          isAvailable: data.product.isAvailable,
        })
      )
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const setField = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const uploadImages = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setUploading(true);
    try {
      const body = new FormData();
      files.forEach((file) => body.append('images', file));
      const { data } = await api.post('/admin/uploads', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm((current) => ({ ...current, images: [...current.images, ...data.urls].slice(0, 8) }));
      toast.success(`${data.urls.length} image(s) uploaded.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const addImageUrl = () => {
    const url = window.prompt('Image URL');
    if (url) setForm((current) => ({ ...current, images: [...current.images, url.trim()].slice(0, 8) }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setFieldErrors({});

    const payload = {
      ...form,
      price: Number(form.price),
      stock: Number(form.stock),
      tags: Array.isArray(form.tags)
        ? form.tags
        : String(form.tags)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
    };

    try {
      if (isEdit) await api.patch(`/admin/products/${id}`, payload);
      else await api.post('/admin/products', payload);

      toast.success(isEdit ? 'Product updated.' : 'Product created.');
      navigate('/admin/products');
    } catch (err) {
      setError(err.message);
      setFieldErrors(Object.fromEntries((err.fieldErrors || []).map((e) => [e.field, e.message])));
      setSaving(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <>
      <div className="page-head">
        <h1>{isEdit ? 'Edit product' : 'New product'}</h1>
      </div>

      {error && <div className="alert error">{error}</div>}

      <form className="panel" onSubmit={submit}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={form.name} onChange={setField('name')} required />
          {fieldErrors.name && <span className="error">{fieldErrors.name}</span>}
        </div>

        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea id="description" rows={5} value={form.description} onChange={setField('description')} required />
          {fieldErrors.description && <span className="error">{fieldErrors.description}</span>}
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" value={form.category} onChange={setField('category')}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="unit">Sold by</label>
            <select id="unit" value={form.unit} onChange={setField('unit')}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="price">Price (Rs.)</label>
            <input id="price" type="number" min="0" step="0.01" value={form.price} onChange={setField('price')} required />
            {fieldErrors.price && <span className="error">{fieldErrors.price}</span>}
          </div>
          <div className="field">
            <label htmlFor="stock">Stock</label>
            <input id="stock" type="number" min="0" value={form.stock} onChange={setField('stock')} required />
            {fieldErrors.stock && <span className="error">{fieldErrors.stock}</span>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="tags">Tags (comma separated)</label>
          <input
            id="tags"
            value={Array.isArray(form.tags) ? form.tags.join(', ') : form.tags}
            onChange={(e) => setForm((current) => ({ ...current, tags: e.target.value }))}
            placeholder="khasi, curry cut, bone-in"
          />
        </div>

        <div className="field">
          <label>Images</label>
          <div className="row">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              onChange={uploadImages}
              disabled={uploading}
              style={{ width: 'auto' }}
            />
            <button type="button" className="btn secondary sm" onClick={addImageUrl}>
              Add by URL
            </button>
            {uploading && <span className="small muted">Uploading…</span>}
          </div>

          {form.images.length > 0 && (
            <div className="row" style={{ marginTop: 12 }}>
              {form.images.map((image) => (
                <div key={image} style={{ position: 'relative' }}>
                  <img src={image} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8 }} />
                  <button
                    type="button"
                    className="btn danger sm"
                    style={{ position: 'absolute', top: 4, right: 4, padding: '2px 7px' }}
                    onClick={() => setForm((c) => ({ ...c, images: c.images.filter((i) => i !== image) }))}
                    aria-label="Remove image"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="field checkbox">
          <input id="isAvailable" type="checkbox" checked={form.isAvailable} onChange={setField('isAvailable')} />
          <label htmlFor="isAvailable" style={{ margin: 0 }}>
            Published — visible in the storefront
          </label>
        </div>

        <div className="row">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
          </button>
          <button type="button" className="btn secondary" onClick={() => navigate('/admin/products')}>
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
