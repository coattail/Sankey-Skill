from .base import AdapterResult
from .generic_filing_tables_adapter import run as run_generic_filing_tables_adapter
from .generic_ir_pdf_adapter import run as run_generic_ir_pdf_adapter
from .manual_financials_adapter import run as run_manual_financials_adapter
from .manual_revenue_structures_adapter import run as run_manual_revenue_structures_adapter
from .official_financials_adapter import run as run_official_financials_adapter
from .official_revenue_structures_adapter import run as run_official_revenue_structures_adapter
from .official_segments_adapter import run as run_official_segments_adapter
from .stockanalysis_financials_adapter import run as run_stockanalysis_financials_adapter
from .supplemental_components_adapter import run as run_supplemental_components_adapter

__all__ = [
    "AdapterResult",
    "run_generic_filing_tables_adapter",
    "run_generic_ir_pdf_adapter",
    "run_manual_financials_adapter",
    "run_manual_revenue_structures_adapter",
    "run_official_financials_adapter",
    "run_official_revenue_structures_adapter",
    "run_official_segments_adapter",
    "run_stockanalysis_financials_adapter",
    "run_supplemental_components_adapter",
]
