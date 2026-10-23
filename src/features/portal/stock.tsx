'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import { useSession } from '../auth/session';
import { Badge, Button, Card, Input } from '../../shared/ui';
import { Empty, ErrorPanel, Loading, PageTitle } from '../warehouse/shared';
import { usePolling } from './polling';
import { catalogCategories, type CatalogProduct } from '../../shared/api/orders';
import {
  PackageIcon,
  CheckCircleIcon,
  WarningCircleIcon,
  MagnifyingGlassIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  StackIcon,
  SparkleIcon,
  FunnelIcon,
} from '@phosphor-icons/react';
import './stock.css';

const PAGE_SIZE = 10;

export function SmeStockPage() {
  const { api, warehouseId, smeId, demo } = useSession();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [stockStatus, setStockStatus] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [page, setPage] = useState(1);

  const resource = usePolling(`${warehouseId}:${smeId}:stock`, async signal => {
    return api!.getWarehouseCatalog(warehouseId, signal, smeId);
  });

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, category, stockStatus]);

  const catalog = useMemo(() => {
    return (resource.data ?? []).map(p => ({
      ...p,
      category: p.category ?? 'uncategorized',
    }));
  }, [resource.data]);

  // Metrics across the full catalog
  const metrics = useMemo(() => {
    let totalUnits = 0;
    let inStock = 0;
    let outOfStock = 0;
    let lowStock = 0;

    for (const item of catalog) {
      const qty = item.available_qty || 0;
      totalUnits += qty;
      if (qty > 10) inStock++;
      else if (qty > 0) lowStock++;
      else outOfStock++;
    }

    return {
      totalProducts: catalog.length,
      totalUnits,
      inStock: inStock + lowStock,
      outOfStock,
    };
  }, [catalog]);

  // Filtered & sorted products
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return catalog.filter(item => {
      if (q) {
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesSku = item.sku.toLowerCase().includes(q);
        if (!matchesName && !matchesSku) return false;
      }

      if (category && item.category !== category) {
        return false;
      }

      const qty = item.available_qty || 0;
      if (stockStatus === 'in_stock' && qty <= 0) return false;
      if (stockStatus === 'low_stock' && (qty <= 0 || qty > 10)) return false;
      if (stockStatus === 'out_of_stock' && qty !== 0) return false;

      return true;
    });
  }, [catalog, search, category, stockStatus]);

  // Pagination calculation (strictly 10 rows maximum)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  if (resource.error) {
    return <ErrorPanel error={resource.error} retry={resource.reload} />;
  }

  if (!resource.data) {
    return <Loading />;
  }

  const base = demo ? '/demo/sme' : '/sme';

  const clearFilters = () => {
    setSearch('');
    setCategory('');
    setStockStatus('all');
    setPage(1);
  };

  const hasActiveFilters = Boolean(search || category || stockStatus !== 'all');

  return (
    <div className="stockWorkspace" id="sme-stock-page">
      <div className="stockHeaderActions">
        <Link href={base} className="stockBackLink" id="back-to-overview-link">
          <ArrowLeftIcon size={16} aria-hidden="true" />
          <span>Back to Overview</span>
        </Link>
        <Button asChild>
          <Link href={`${base}/orders`} id="stock-create-release-btn">
            <PackageIcon size={16} aria-hidden="true" />
            <span>Create stock release request</span>
          </Link>
        </Button>
      </div>

      <PageTitle
        title="Total Stock in Warehouse"
        my="ဂိုဒေါင်ရှိ စုစုပေါင်း စတော့"
        description="Comprehensive inventory of your SME-owned stock stored at ParcelCare warehouse. View available quantities and initiate dispatch releases."
      />

      {/* KPI Overview Cards */}
      <div className="stockKpiGrid" aria-label="Inventory metrics">
        <div className="stockKpiCard">
          <div className="stockKpiIcon stockKpiIconBlue" aria-hidden="true">
            <PackageIcon size={24} weight="duotone" />
          </div>
          <div className="stockKpiContent">
            <span className="stockKpiLabel">Total Products</span>
            <span className="stockKpiValue">{metrics.totalProducts}</span>
          </div>
        </div>

        <div className="stockKpiCard">
          <div className="stockKpiIcon stockKpiIconGreen" aria-hidden="true">
            <CheckCircleIcon size={24} weight="duotone" />
          </div>
          <div className="stockKpiContent">
            <span className="stockKpiLabel">Available Units</span>
            <span className="stockKpiValue">{metrics.totalUnits.toLocaleString()}</span>
          </div>
        </div>

        <div className="stockKpiCard">
          <div className="stockKpiIcon stockKpiIconAmber" aria-hidden="true">
            <StackIcon size={24} weight="duotone" />
          </div>
          <div className="stockKpiContent">
            <span className="stockKpiLabel">In-Stock Lines</span>
            <span className="stockKpiValue">{metrics.inStock}</span>
          </div>
        </div>

        <div className="stockKpiCard">
          <div className="stockKpiIcon stockKpiIconRose" aria-hidden="true">
            <WarningCircleIcon size={24} weight="duotone" />
          </div>
          <div className="stockKpiContent">
            <span className="stockKpiLabel">Out of Stock</span>
            <span className="stockKpiValue">{metrics.outOfStock}</span>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <Card className="stockToolbarCard">
        <div className="stockToolbar">
          <div className="stockSearchWrapper">
            <MagnifyingGlassIcon size={18} className="stockSearchIcon" aria-hidden="true" />
            <Input
              id="stock-search-input"
              type="search"
              className="stockSearchInput"
              placeholder="Search product name or SKU…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search stock products"
            />
          </div>

          <div className="stockFilterGroup">
            <select
              id="stock-category-select"
              className="stockSelect"
              value={category}
              onChange={e => setCategory(e.target.value)}
              aria-label="Filter by product category"
            >
              <option value="">All Categories</option>
              {Object.entries(catalogCategories).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            <select
              id="stock-status-select"
              className="stockSelect"
              value={stockStatus}
              onChange={e => setStockStatus(e.target.value as any)}
              aria-label="Filter by stock status"
            >
              <option value="all">All Stock Statuses</option>
              <option value="in_stock">In Stock (&gt; 0)</option>
              <option value="low_stock">Low Stock (1–10)</option>
              <option value="out_of_stock">Out of Stock (0)</option>
            </select>

            {hasActiveFilters && (
              <Button variant="outline" className="px-3 py-2 text-xs" onClick={clearFilters} id="stock-clear-filters-btn">
                Clear filters
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Main Stock Table with 10-Row Maximum & Pagination */}
      <Card className="stockTableCard">
        <div className="stockTableHeaderBar">
          <span className="stockTableTitle">Product Inventory List</span>
          <span className="stockCountBadge" role="status">
            Showing {filtered.length === 0 ? 0 : startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, filtered.length)} of {filtered.length} products
          </span>
        </div>

        {pageItems.length > 0 ? (
          <div className="stockTableContainer" tabIndex={0} role="region" aria-label="Stock inventory table">
            <table className="stockTable" id="stock-table">
              <thead>
                <tr>
                  <th scope="col" className="stockIndexCell">#</th>
                  <th scope="col">Product Name</th>
                  <th scope="col">SKU</th>
                  <th scope="col">Category</th>
                  <th scope="col" style={{ textAlign: 'right', paddingRight: '24px' }}>Available to Release</th>
                  <th scope="col">Status</th>
                  <th scope="col" style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item, idx) => {
                  const qty = item.available_qty || 0;
                  const categoryLabel = item.category ? (catalogCategories[item.category] ?? item.category) : 'General';
                  const isOutOfStock = qty === 0;
                  const isLowStock = qty > 0 && qty <= 10;

                  return (
                    <tr key={item.id} id={`stock-row-${item.id}`}>
                      <td className="stockIndexCell">{startIdx + idx + 1}</td>
                      <td>
                        <span className="stockProductName" data-user-content>{item.name}</span>
                      </td>
                      <td>
                        <span className="stockSkuBadge" data-user-content>{item.sku}</span>
                      </td>
                      <td>
                        <span className="stockCategoryBadge">{categoryLabel}</span>
                      </td>
                      <td className="stockQtyCell">{qty.toLocaleString()}</td>
                      <td>
                        {isOutOfStock ? (
                          <Badge className="stockBadgeOut">Out of stock</Badge>
                        ) : isLowStock ? (
                          <Badge className="stockBadgeLow">Low stock ({qty})</Badge>
                        ) : (
                          <Badge className="stockBadgeInStock">In stock</Badge>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {qty > 0 ? (
                          <Button variant="outline" className="px-3 py-1.5 text-xs inline-flex items-center gap-1.5" asChild>
                            <Link href={`${base}/orders`}>
                              <span>Request release</span>
                              <ArrowRightIcon size={14} aria-hidden="true" />
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted">Unavailable</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <Empty
              text={
                hasActiveFilters
                  ? 'No products match your search or filter criteria.'
                  : 'No inventory items recorded yet in the warehouse.'
              }
            />
            {hasActiveFilters && (
              <div className="mt-4">
                <Button variant="outline" onClick={clearFilters}>
                  Clear all filters
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Pagination Bar - Max 10 rows per page */}
        {filtered.length > 0 && (
          <nav className="stockPaginationBar" aria-label="Stock pagination controls">
            <div className="stockPaginationInfo">
              Showing <strong>{startIdx + 1}</strong> to <strong>{Math.min(startIdx + PAGE_SIZE, filtered.length)}</strong> of{' '}
              <strong>{filtered.length}</strong> products · Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
            </div>

            <div className="stockPaginationNav">
              <button
                type="button"
                className="stockPageBtn"
                disabled={currentPage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                aria-label="Previous page"
                id="stock-prev-page"
              >
                <CaretLeftIcon size={16} aria-hidden="true" />
                <span className="ml-1">Prev</span>
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => {
                  // Show first, last, and pages close to currentPage
                  if (totalPages <= 7) return true;
                  if (p === 1 || p === totalPages) return true;
                  return Math.abs(p - currentPage) <= 1;
                })
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) {
                    acc.push(`ellipsis-${p}`);
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map(item => {
                  if (typeof item === 'string') {
                    return (
                      <span key={item} className="stockPageEllipsis" aria-hidden="true">
                        …
                      </span>
                    );
                  }
                  return (
                    <button
                      key={item}
                      type="button"
                      className={`stockPageBtn ${item === currentPage ? 'stockPageBtnActive' : ''}`}
                      onClick={() => setPage(item)}
                      aria-label={`Go to page ${item}`}
                      aria-current={item === currentPage ? 'page' : undefined}
                    >
                      {item}
                    </button>
                  );
                })}

              <button
                type="button"
                className="stockPageBtn"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                aria-label="Next page"
                id="stock-next-page"
              >
                <span className="mr-1">Next</span>
                <CaretRightIcon size={16} aria-hidden="true" />
              </button>
            </div>
          </nav>
        )}
      </Card>
    </div>
  );
}
