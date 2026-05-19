<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceUpdate extends Model
{
    protected $fillable = [
        'service_id',
        'type',
        'old_rate',
        'new_rate'
    ];

    public function service()
    {
        return $this->belongsTo(Service::class);
    }
}