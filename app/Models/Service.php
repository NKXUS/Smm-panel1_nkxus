<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Service extends Model
{
    protected $fillable = [
        'category_id',
        'name',
        'rate_per_1000',
        'min_order',
        'max_order',
        'avg_time',
        'description',
        'platform',
        'is_active',
        'is_featured'
    ];

    public function category()
    {
        return $this->belongsTo(ServiceCategory::class, 'category_id');
    }

    public function orders()
    {
        return $this->hasMany(Order::class);
    }
    public function updates()
{
    return $this->hasMany(ServiceUpdate::class, 'service_id');
}
}