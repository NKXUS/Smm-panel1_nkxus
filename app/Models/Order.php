<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $fillable = [
        'user_id',
        'service_id',
        'link',
        'quantity',
        'charge',
        'start_count',
        'remains',
        'status'
    ];

   public function user()
{
    return $this->belongsTo(SmmUser::class, 'user_id');
}

public function service()
{
    return $this->belongsTo(Service::class, 'service_id');
}
}