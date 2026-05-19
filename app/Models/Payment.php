<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    protected $fillable = [
        'user_id',
        'amount',
        'method',
        'phone',
        'status'
    ];

    public function user()
    {
        return $this->belongsTo(SmmUser::class, 'user_id');
    }
}