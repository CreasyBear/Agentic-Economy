'use client'

/* AE-owned table renderer preserves stable row IDs, TanStack sorting and selection, and operator action focus.
 * Invariant: filtered-empty recovery never changes sorting, row identity or authority.
 * On violation: existing loading, empty and non-selectable states remain explicit. */

import { formatCount } from '@/lib/ui/format-time'
import {
  filterFn_includesString,
  flexRender,
  useTable,
  Subscribe,
  type CellContext,
  type HeaderContext,
  type Column,
  type ColumnDef,
  type FilterFn,
  type OnChangeFn,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Table as TanStackTable,
} from '@tanstack/react-table'
import * as RovingFocusGroup from '@/components/ui/roving-focus'
import { Link } from '@tanstack/react-router'
import { type ReactNode, createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AeViewBar } from '@/components/ae/data/AeViewBar'
import { Button } from '@/components/arc/button/button'
import { DataGridColumnHeader } from '@/components/reui/data-grid/data-grid-column-header'
import { DataGridColumnVisibility } from '@/components/reui/data-grid/data-grid-column-visibility'
import { DataGrid, DataGridContainer, dataGridFeatures, type DataGridFeatures } from '@/components/reui/data-grid/data-grid'
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table'
import { DataGridScrollArea } from '@/components/reui/data-grid/data-grid-scroll-area'
import './RecordTable.css'
import { useAeTablePreferences } from './AeTablePreferencesContext'
import { AeTableLayoutMenu } from './AeTableLayoutMenu'
import { Checkbox } from '@/components/ae/shared/base-ui/checkbox/checkbox'
import { useFirstLoadPending } from '@/components/ui/data-state'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'


export type AeRecordTableFeatures = DataGridFeatures

type SelectionControls = {
  caption: string
  showSelectAll: boolean | undefined
  getLabel: (id: string) => string
  toggle: (id: string, checked: boolean) => void
}
const RecordSelectionControls = createContext<SelectionControls | undefined>(undefined)
function RecordSelectionCell<TData extends object>({ row }: CellContext<AeRecordTableFeatures, TData, unknown>) {
  const controls = useContext(RecordSelectionControls)
  if (controls === undefined) return null
  return <Subscribe source={row.table.atoms.rowSelection}>{() => <SelectionCheckbox
    checked={row.getIsSelected()} disabled={!row.getCanSelect()}
    onCheckedChange={checked => controls.toggle(row.id, checked)}
    aria-label={`Select ${controls.getLabel(row.id)}`} />}</Subscribe>
}
function RecordSelectionHeader<TData extends object>({ table }: HeaderContext<AeRecordTableFeatures, TData, unknown>) {
  const controls = useContext(RecordSelectionControls)
  return controls === undefined ? null : <TableSelectionHeader table={table} caption={controls.caption}
    {...(controls.showSelectAll === undefined ? {} : { showSelectAll: controls.showSelectAll })} />
}

export type AeRecordTableSelection<TData extends object> = Readonly<{
  state: RowSelectionState
  onChange: OnChangeFn<RowSelectionState>
  getRowLabel: (row: TData) => string
  canSelectRow?: (row: TData) => boolean
  showSelectAll?: boolean
  showStatus?: boolean
  /** Opt into range selection and non-interactive row click; authority guards still apply. */
  rowInteraction?: boolean
}>

export type AeRecordTableRowAction<TData extends object> =
  | Readonly<{
      kind: 'link'
      label: string
      getLabel?: (row: TData) => string
      getHref: (row: TData) => string
      getAccessibleLabel: (row: TData) => string
    }>
  | Readonly<{
      kind: 'button'
      label: string
      getLabel?: (row: TData) => string
      onOpen: (row: TData) => void
      getAccessibleLabel: (row: TData) => string
    }>

type AeRecordTableBaseProps<TData extends object> = {
  columns: ColumnDef<AeRecordTableFeatures, TData, unknown>[]
  data: readonly TData[]
  filterPlaceholder?: string
  emptyMessage?: string
  caption?: string
  ariaLabel?: string
  tableClassName?: string
  getRowClassName?: (row: TData) => string
  /** Controls are local even without an authenticated persistence scope. */
  layoutControls?: boolean
  keyboardNavigation?: boolean
  announceChanges?: boolean
  /** Stable identity for scoped presentation preferences; caption and column schema are the fallback. */
  tableKey?: string
  maxHeight?: string
  hideFilter?: boolean
  countLabel?: string
  action?: ReactNode
  /** Below 620px rows fold into wrapped lines (default) or keep the desktop grid inside a horizontal scroller. */
  mobileLayout?: 'cards' | 'scroll'
  /**
   * True while a load is in flight. Skeletons render only before the first
   * settled result; refreshing an already-populated table keeps its rows.
   */
  loading?: boolean
  /** The supplied page is already ordered/filtered by its server owner; no local data processing. */
  serverControlled?: boolean
  filterValue?: string
  onFilterChange?: (value: string) => void
  /** Caller-owned matching over supplied facts, retained by the existing engine. */
  globalFilterFn?: FilterFn<AeRecordTableFeatures, TData>
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  /**
   * Extra classes applied to rows in the selected state. Market compare
   * uses this for a brand connection to the comparison tray; operator
   * tables keep the default muted fill.
   */
  selectedRowClassName?: string
  /**
   * Roving row-action focus: when `restore` is true and `currentId` is set,
   * focus returns to that row's action on the next render it is visible.
   */
  rowActionFocus?: Readonly<{
    currentId?: string
    onCurrentIdChange?: (id: string) => void
    restore?: boolean
  }>
}

type AeRecordTableProps<TData extends object> = AeRecordTableBaseProps<TData> &
  (
    | Readonly<{
        selection?: AeRecordTableSelection<TData>
        rowAction?: AeRecordTableRowAction<TData>
        getRowId: (row: TData, index: number, parent?: Row<AeRecordTableFeatures, TData>) => string
      }>
    | Readonly<{
        selection?: undefined
        rowAction?: undefined
        getRowId?: (row: TData, index: number, parent?: Row<AeRecordTableFeatures, TData>) => string
      }>
  )

export function AeRecordTable<TData extends object>({
  columns,
  data,
  filterPlaceholder = 'Filter rows…',
  emptyMessage = 'No rows match this filter.',
  caption = 'Records',
  ariaLabel,
  tableClassName,
  getRowClassName,
  layoutControls = true,
  keyboardNavigation = false,
  announceChanges = false,
  tableKey,
  maxHeight,
  hideFilter = false,
  countLabel = 'rows',
  action,
  mobileLayout = 'cards',
  getRowId,
  rowAction,
  selection,
  loading = false,
  serverControlled = false,
  filterValue,
  onFilterChange,
  globalFilterFn,
  sorting: controlledSorting,
  onSortingChange,
  selectedRowClassName,
  rowActionFocus,
}: AeRecordTableProps<TData>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([])
  const [internalGlobalFilter, setInternalGlobalFilter] = useState('')
  const tableRootRef = useRef<HTMLDivElement>(null)
  const selectionAnchor = useRef<string | undefined>(undefined)
  const extendSelection = useRef(false)
  const [announcement, setAnnouncement] = useState('')
  const sorting = controlledSorting ?? internalSorting
  const globalFilter = filterValue ?? internalGlobalFilter
  const updateSorting = onSortingChange ?? setInternalSorting
  const updateGlobalFilter = onFilterChange ?? setInternalGlobalFilter
  const onCurrentRowActionIdChange = rowActionFocus?.onCurrentIdChange
  const hasServerSorting = onSortingChange !== undefined

  const toggleSelectionRow = useCallback((row: Row<AeRecordTableFeatures, TData>, checked: boolean, extend: boolean) => {
    if (selection === undefined || !row.getCanSelect()) return
    const ordered = row.table.getRowModel().rows
    const from = extend && selectionAnchor.current !== undefined ? ordered.findIndex(candidate => candidate.id === selectionAnchor.current) : -1
    const to = ordered.findIndex(candidate => candidate.id === row.id)
    const affected = from < 0 || to < 0 ? [row] : ordered.slice(Math.min(from, to), Math.max(from, to) + 1)
    selection.onChange(previous => {
      const next = { ...previous }
      for (const candidate of affected) {
        if (!candidate.getCanSelect()) continue
        if (checked) next[candidate.id] = true
        else delete next[candidate.id]
      }
      return next
    })
    selectionAnchor.current = row.id
    setAnnouncement('')
  }, [selection])

  const selectionColumn = useMemo<ColumnDef<AeRecordTableFeatures, TData, unknown> | undefined>(
    () =>
      selection === undefined
        ? undefined
        : {
            id: '__ae_selection',
            size: 44, minSize: 44, maxSize: 44, enableResizing: false,
            meta: { label: 'Select' },
            enableSorting: false,
            enableHiding: false,
            header: RecordSelectionHeader,
            cell: RecordSelectionCell,
          },
    [selection],
  )

  const actionColumn = useMemo<ColumnDef<AeRecordTableFeatures, TData, unknown> | undefined>(
    () =>
      rowAction === undefined
        ? undefined
        : {
            id: '__ae_action',
            size: 104, minSize: 88, maxSize: 250, enableResizing: false,
            meta: { label: rowAction.label },
            enableSorting: false,
            enableHiding: false,
            header: () => rowAction.label,
            cell: ({ row }) => <RecordTableAction row={row} action={rowAction} />,
          },
    [rowAction],
  )

  const resolvedColumns = useMemo(() => [selectionColumn, ...columns, actionColumn]
    .filter((column): column is ColumnDef<AeRecordTableFeatures, TData, unknown> => column !== undefined)
    .map((column): ColumnDef<AeRecordTableFeatures, TData, unknown> => ({
      ...column,
      ...(serverControlled && !hasServerSorting ? { enableSorting: false } : {}),
      id: column.id ?? ('accessorKey' in column ? String(column.accessorKey).replaceAll('.', '_') : typeof column.header === 'string' ? column.header : ''),
      // Keep the native sortable header behavior for ordinary string headers.
      ...(column.meta?.truncate ? {
        cell: (context: CellContext<AeRecordTableFeatures, TData, unknown>) => {
          // Only text is a readable title; numbers here may be sort keys such as Date epochs.
          const value = context.getValue()
          const full = typeof value === 'string' ? value : undefined
          return <span className="block truncate" title={full}>{column.cell === undefined ? (value == null ? null : String(value)) : flexRender(column.cell, context)}</span>
        },
      } : {}),
      ...(typeof column.header === 'string' ? {
        header: ({ column: instance }) => instance.getCanSort()
          ? <AeOperatorSortableHeader label={typeof column.header === 'string' ? column.header : instance.id} column={instance} />
          : column.header,
      } : {}),
      meta: {
        ...column.meta,
        skeleton: column.meta?.skeleton ?? <span aria-hidden="true" className="block h-4 w-24 rounded bg-muted animate-pulse motion-reduce:animate-none" />,
        ...(column.meta?.label === undefined && typeof column.header !== 'string' ? {} : { headerTitle: column.meta?.label ?? (typeof column.header === 'string' ? column.header : '') }),
        ...(column.meta?.numeric ? { headerClassName: 'text-end' } : {}),
        cellClassName: [column.meta?.cellClassName, column.meta?.numeric ? 'text-end tabular-nums' : undefined, column.meta?.truncate ? 'max-w-72 truncate' : undefined].filter(Boolean).join(' '),
      },
    })), [actionColumn, columns, selectionColumn, serverControlled, hasServerSorting])

  const preferenceColumns = useMemo(() => resolvedColumns.map(column => ({ id: column.id ?? '', canHide: column.enableHiding !== false })), [resolvedColumns])
  const preferences = useAeTablePreferences(tableKey ?? caption, preferenceColumns)

  const tableData = useMemo(() => [...data], [data])
  const table = useTable({
    features: dataGridFeatures,
    data: tableData,
    columns: resolvedColumns,
    state: {
      sorting,
      globalFilter,
      columnVisibility: preferences.columnVisibility,
      columnSizing: preferences.columnSizing,
      ...(selection === undefined ? {} : { rowSelection: selection.state }),
    },
    onSortingChange: updater => { setAnnouncement(''); updateSorting(updater) },
    onColumnVisibilityChange: preferences.onColumnVisibilityChange,
    onColumnSizingChange: preferences.onColumnSizingChange,
    onGlobalFilterChange: updateGlobalFilter,
    globalFilterFn: globalFilterFn ?? filterFn_includesString,
    ...(selection === undefined
      ? {}
      : {
          onRowSelectionChange: selection.onChange,
          enableRowSelection: (row: Row<AeRecordTableFeatures, TData>) =>
            selection.canSelectRow?.(row.original) ?? true,
        }),
    ...(getRowId === undefined ? {} : { getRowId }),
    manualPagination: true,
    manualSorting: serverControlled,
    manualFiltering: serverControlled,
  })

  const showFilter = !hideFilter && (data.length > 1 || globalFilter.length > 0)
  const rowCount = table.getRowModel().rows.length
  const showSkeleton = useFirstLoadPending(loading)
  const hasActiveFilter = globalFilter.trim().length > 0
  const visibleRows = table.getRowModel().rows
  const selectableVisibleRows =
    selection === undefined ? [] : visibleRows.filter((row) => row.getCanSelect())
  const selectedVisibleCount = selectableVisibleRows.filter((row) => row.getIsSelected()).length
  const visibleRowKey = visibleRows.map((row) => row.id).join('\u0000')
  const handleCurrentTabStopIdChange = useCallback(
    (id: string | null) => {
      if (id !== null) onCurrentRowActionIdChange?.(id)
    },
    [onCurrentRowActionIdChange],
  )

  useEffect(() => {
    if (rowActionFocus?.restore !== true || rowActionFocus.currentId === undefined) return
    const action = Array.from(
      tableRootRef.current?.querySelectorAll<HTMLElement>('[data-ae-row-action-id]') ?? [],
    ).find((element) => element.dataset.aeRowActionId === rowActionFocus.currentId)
    if (action === undefined) return
    const frame = window.requestAnimationFrame(() => {
      action.focus({ preventScroll: true })
      action.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [rowActionFocus?.currentId, rowActionFocus?.restore, visibleRowKey])


  const firstSort = sorting[0]
  const sortedColumn = firstSort === undefined ? undefined : table.getColumn(firstSort.id)
  const sortMessage = firstSort === undefined ? '' : `Sorted by ${sortedColumn?.columnDef.meta?.label ?? sortedColumn?.columnDef.meta?.headerTitle ?? firstSort.id}, ${firstSort.desc ? 'descending' : 'ascending'}`
  const selectionMessage = selection?.rowInteraction && selectedVisibleCount > 0 ? `${selectedVisibleCount} of ${selectableVisibleRows.length} selected` : ''
  const liveMessage = announcement || selectionMessage || sortMessage

  const selectionControls: SelectionControls | undefined = selection === undefined ? undefined : {
    caption, showSelectAll: selection.showSelectAll,
    getLabel: id => {
      const row = visibleRows.find(candidate => candidate.id === id)
      return row === undefined ? id : selection.getRowLabel(row.original)
    },
    toggle: (id, checked) => {
      const row = visibleRows.find(candidate => candidate.id === id)
      if (row === undefined || !row.getCanSelect()) return
      if (selection.rowInteraction) toggleSelectionRow(row, checked, extendSelection.current)
      else row.toggleSelected(checked)
    },
  }

  return (
    <RecordSelectionControls.Provider value={selectionControls}><div
      ref={tableRootRef}
      onClickCapture={event => { extendSelection.current = event.shiftKey }}
      onClick={event => {
        if (!selection?.rowInteraction || !(event.target instanceof Element) || !event.currentTarget.contains(event.target)) return
        if (event.target.closest('a,button,input,label,select,textarea,[role="button"],[role="checkbox"],[contenteditable]') || window.getSelection()?.toString()) return
        const node = event.target.closest<HTMLElement>('tr[data-row-id]')
        const row = visibleRows.find(candidate => candidate.id === node?.dataset.rowId)
        if (row === undefined || !row.getCanSelect()) return
        toggleSelectionRow(row, !row.getIsSelected(), event.shiftKey)
        node?.querySelector<HTMLElement>('[role="checkbox"]')?.focus({ preventScroll: true })
      }}
      onKeyDown={event => {
        if (!keyboardNavigation || !(event.target instanceof HTMLElement) || !event.currentTarget.contains(event.target)) return
        if (event.key === 'Escape' && selection?.rowInteraction && selectedVisibleCount > 0) {
          event.preventDefault(); event.stopPropagation()
          table.resetRowSelection(true)
          setAnnouncement('Selection cleared')
          return
        }
        const inHeader = event.target.closest('thead') !== null
        const inSelection = event.target.matches('tbody [role="checkbox"]')
        if (!inHeader && !inSelection) return
        const selector = inHeader ? 'thead button[aria-label^="Sort by"],thead [role="checkbox"]' : 'tbody [role="checkbox"]'
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(selector)).filter(control => !control.hasAttribute('disabled') && control.getAttribute('aria-disabled') !== 'true')
        const index = controls.indexOf(event.target)
        if (index < 0) return
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1
          : event.key === (inHeader ? 'ArrowRight' : 'ArrowDown') ? index + 1
          : event.key === (inHeader ? 'ArrowLeft' : 'ArrowUp') ? index - 1 : undefined
        const next = nextIndex === undefined ? undefined : controls[nextIndex]
        if (next !== undefined) { event.preventDefault(); next.focus() }
      }}
      {...(showSkeleton ? { 'aria-busy': true } : {})}
      className="arc-market arc-record-root"
      data-mobile-layout={mobileLayout}
    >
      <div className="min-w-0">
        <DataGrid className="grid gap-4" table={table} recordCount={rowCount} isLoading={showSkeleton} loadingMode="skeleton"
          tableLayout={{ width: layoutControls ? 'fixed' : 'auto', columnsResizable: layoutControls, dense: preferences.density === 'compact', headerSticky: maxHeight !== undefined }}
          {...(ariaLabel === undefined ? {} : { tableAriaLabel: ariaLabel })}
          tableClassNames={{ base: ['arc-record-table', tableClassName].filter(Boolean).join(' '), bodyRow: 'has-[:focus-visible]:bg-muted/50' }}
          getRowClassName={(record: TData) => {
            const id = getRowId?.(record, tableData.indexOf(record))
            const selectedClass = id !== undefined && selection?.state[id] === true ? selectedRowClassName : undefined
            return [getRowClassName?.(record), selectedClass].filter(Boolean).join(' ')
          }}
          emptyMessage={<div className="flex flex-wrap items-center gap-related">
            <span>{emptyMessage}</span>
            {hasActiveFilter ? <Button type="button" variant="secondary" size="sm" onClick={() => updateGlobalFilter('')}>Clear filter</Button> : null}
          </div>}
        >
      {showFilter || action !== undefined || layoutControls ? (
        <AeViewBar
          filterValue={globalFilter}
          {...(showFilter ? { onFilterChange: updateGlobalFilter } : {})}
          filterPlaceholder={filterPlaceholder}
          count={rowCount}
          countLabel={countLabel}
          {...(action === undefined && !layoutControls ? {} : { action: <div className="flex flex-wrap items-center gap-2">
            {action}
            {layoutControls ? <><DataGridColumnVisibility table={table} trigger={<Button type="button" variant="secondary" size="sm">Columns</Button>} /><AeTableLayoutMenu density={preferences.density}
              onDensityChange={preferences.setDensity} onReset={preferences.reset} /></> : null}
          </div> })}
        />
      ) : null}
          <DataGridContainer>
            <DataGridScrollArea className="arc-record-scroll" orientation={maxHeight === undefined ? 'horizontal' : 'both'}
              {...(maxHeight === undefined ? {} : { style: { maxHeight } })}>
              <RecordTableBody
                body={<DataGridTable caption={caption} />}
                roving={rowAction !== undefined}
                {...(visibleRows[0] === undefined ? {} : { defaultTabStopId: visibleRows[0].id })}
                {...(onCurrentRowActionIdChange === undefined ? {} : {
                  onCurrentTabStopChange: (target: EventTarget | null) => {
                    const id = (target as HTMLElement | null)?.dataset.aeRowActionId ?? null
                    handleCurrentTabStopIdChange(id)
                  },
                })}
              />
            </DataGridScrollArea>
          </DataGridContainer>
        </DataGrid>
      </div>
      {selection === undefined || selection.showStatus === false ? null : (
        <p
          {...(announceChanges ? {} : { role: 'status', 'aria-live': 'polite' })}
          className="arc-record-footer"
        >
          {formatCount(selectedVisibleCount)} of{' '}
          {formatCount(selectableVisibleRows.length)} selected
          {selection.rowInteraction && selectedVisibleCount > 0 ? <Button type="button" variant="ghost" size="sm" className="ms-2" onClick={() => {
            table.resetRowSelection(true); setAnnouncement('Selection cleared')
            tableRootRef.current?.querySelector<HTMLElement>('thead [role="checkbox"]')?.focus()
          }}>Clear selection</Button> : null}
        </p>
      )}
      {announceChanges && liveMessage !== '' ? <p className="sr-only" role="status" aria-live="polite">{liveMessage}</p> : null}
    </div></RecordSelectionControls.Provider>
  )
}

function RecordTableAction<TData extends object>({
  row,
  action,
}: {
  row: Row<AeRecordTableFeatures, TData>
  action: AeRecordTableRowAction<TData>
}) {
  const accessibleLabel = action.getAccessibleLabel(row.original)
  const label = action.getLabel?.(row.original) ?? action.label
  const control =
    action.kind === 'link' ? (
      <Link
        to={action.getHref(row.original)}
        aria-label={accessibleLabel}
        data-ae-row-action-id={row.id}
        className={`${actionLinkClassName('ghost', 'sm')} arc-record-action`}
      >
        {label}
      </Link>
    ) : (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="arc-record-action"
        aria-label={accessibleLabel}
        data-ae-row-action-id={row.id}
        onClick={() => action.onOpen(row.original)}
      >
        {label}
      </Button>
    )

  return (
    <div className="flex items-center">
      <RovingFocusGroup.Item render={control} tabStopId={row.id} />
    </div>
  )
}

function SelectionCheckbox({
  checked,
  disabled,
  onCheckedChange,
  'aria-label': ariaLabel,
}: Readonly<{
  checked: boolean | 'indeterminate'
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  'aria-label': string
}>) {
  return (
    <div className="arc-record-selection-hit">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-label={ariaLabel}
      />
    </div>
  )
}

function RecordTableBody({
  body,
  roving,
  defaultTabStopId,
  onCurrentTabStopChange,
}: {
  body: ReactNode
  roving: boolean
  defaultTabStopId?: string
  onCurrentTabStopChange?: (target: EventTarget | null) => void
}) {
  return roving ? (
    <RovingFocusGroup.Root
      orientation="vertical"
      loop={false}
      {...(onCurrentTabStopChange === undefined
        ? {}
        : { onCurrentTabStopChange })}
      {...(defaultTabStopId === undefined ? {} : { defaultTabStopId })}
    >{body}</RovingFocusGroup.Root>
  ) : (
    body
  )
}

function TableSelectionHeader<TData extends object>({
  table,
  caption,
  showSelectAll,
}: {
  table: TanStackTable<AeRecordTableFeatures, TData>
  caption: string
  showSelectAll?: boolean
}) {
  if (showSelectAll === false) return <span className="sr-only">Select</span>

  return (
    <SelectionCheckbox
      checked={
        table.getIsAllPageRowsSelected()
          ? true
          : table.getIsSomePageRowsSelected()
            ? 'indeterminate'
            : false
      }
      disabled={!table.getRowModel().rows.some((row) => row.getCanSelect())}
      onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
      aria-label={`Select all ${caption}`}
    />
  )
}


export function AeOperatorSortableHeader<TData extends object, TValue>({
  label,
  column,
}: {
  label: string
  column: Column<AeRecordTableFeatures, TData, TValue>
}) {
  if (!column.getCanSort()) return <span>{label}</span>
  return <DataGridColumnHeader column={column} title={label} />
}
