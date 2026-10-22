from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

Category = Literal['food_beverages','clothing_accessories','home_kitchen','electronics','beauty_personal_care','health_medical','office_stationery','other']
Attribute = Literal['description','material','intended_use','storage_notes']
CATEGORIES = {'food_beverages':'Food & beverages','clothing_accessories':'Clothing & accessories','home_kitchen':'Home & kitchen','electronics':'Electronics','beauty_personal_care':'Beauty & personal care','health_medical':'Health & medical','office_stationery':'Office & stationery','other':'Other'}
class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
class Metadata(Strict):
    description: str = Field(default='', max_length=2000)
    material: str = Field(default='', max_length=300)
    intended_use: str = Field(default='', max_length=500)
    storage_notes: str = Field(default='', max_length=500)
class MetadataCommand(Metadata):
    expected_revision: int = Field(ge=0)
class AnalyzeCommand(Strict):
    expected_revision: int = Field(ge=0)
class ReviewCommand(AnalyzeCommand):
    category: Category
    note: str = Field(min_length=5, max_length=1000)
    acknowledge_flags: bool = False
class Suggestion(Strict):
    category: Category
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    rationale: str = Field(min_length=1, max_length=1500)
    uncertain_attributes: list[Attribute] = Field(max_length=4)
class SavedSuggestion(Suggestion):
    missing_attributes: list[Attribute]
    model: str
    requires_review: bool = True
class CategoryState(Strict):
    product_id: str
    warehouse_id: str
    sme_id: str
    name: str
    sku: str
    revision: int
    metadata: Metadata
    suggestion: SavedSuggestion | None
    category: Category | None
    status: Literal['pending','verified']
    review_note: str | None
    reviewed_by: str | None
    reviewed_at: str | None
    updated_at: str | None
class CategoryOptions(Strict):
    categories: dict[str,str]
    ai_available: bool
    provider: str
    model: str
